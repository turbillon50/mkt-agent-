import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { polls, pollVotes, users, type Poll, type PollOption } from '@/src/db/schema';
import { appUrl, uniqueSlug, shortId } from './public-links';
import { capturePublicLead } from './public-leads';
import { isResendConfigured, sendEmail, emailHtml, isValidEmail } from './resend';

// ── (10) Co-creacion de productos (votacion) ──────────────────────────────
// El influencer crea una votacion entre 2-4 opciones de producto y comparte
// un link publico (/vota/[slug]). Cada votante deja nombre + correo (un voto
// por correo) y se captura como lead. Al cerrar la votacion se calcula la
// opcion ganadora y se avisa por correo a TODOS los que votaron.

export type Tally = Record<string, number>;

export function voteUrl(slug: string): string {
  return `${appUrl()}/vota/${slug}`;
}

/** Conteo de votos por opcion para un poll. */
export async function getPollTally(pollId: string): Promise<Tally> {
  const rows = await db
    .select({ optionId: pollVotes.optionId, count: sql<number>`count(*)::int` })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId))
    .groupBy(pollVotes.optionId);
  const tally: Tally = {};
  for (const r of rows) tally[r.optionId] = Number(r.count) || 0;
  return tally;
}

export type PollWithTally = Poll & { tally: Tally };

/** Lista las votaciones del usuario con el conteo de votos por opcion. */
export async function listPolls(userId: string): Promise<PollWithTally[]> {
  const rows = await db.select().from(polls).where(eq(polls.userId, userId)).orderBy(desc(polls.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.id);
  const counts = await db
    .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId, count: sql<number>`count(*)::int` })
    .from(pollVotes)
    .where(inArray(pollVotes.pollId, ids))
    .groupBy(pollVotes.pollId, pollVotes.optionId);

  const byPoll: Record<string, Tally> = {};
  for (const c of counts) {
    (byPoll[c.pollId] ??= {})[c.optionId] = Number(c.count) || 0;
  }

  return rows.map((p) => ({ ...p, tally: byPoll[p.id] ?? {} }));
}

export async function getPollBySlug(slug: string): Promise<Poll | null> {
  const [row] = await db.select().from(polls).where(eq(polls.slug, slug)).limit(1);
  return row ?? null;
}

export type CreatePollInput = {
  question: string;
  description?: string | null;
  options: { label: string; description?: string | null }[];
};

export async function createPoll(userId: string, input: CreatePollInput): Promise<Poll> {
  const question = (input.question ?? '').trim();
  if (!question) throw new Error('La votación necesita una pregunta.');

  const options: PollOption[] = (input.options ?? [])
    .map((o) => ({ label: (o.label ?? '').trim(), description: o.description?.trim() || undefined }))
    .filter((o) => o.label)
    .map((o) => ({ id: shortId(5), label: o.label, ...(o.description ? { description: o.description } : {}) }));

  if (options.length < 2) throw new Error('Pon al menos 2 opciones para votar.');
  if (options.length > 4) throw new Error('Máximo 4 opciones por votación.');

  const [row] = await db
    .insert(polls)
    .values({
      userId,
      slug: uniqueSlug(question),
      question,
      description: input.description?.trim() || null,
      options,
      status: 'open',
    })
    .returning();
  if (!row) throw new Error('No se pudo crear la votación.');
  return row;
}

export type VoteInput = { optionId: string; name?: string | null; email: string };
export type VoteResult = { ok: boolean; already?: boolean; tally: Tally };

export async function vote(slug: string, input: VoteInput): Promise<VoteResult> {
  const poll = await getPollBySlug(slug);
  if (!poll) throw new Error('Esta votación no existe.');
  if (poll.status !== 'open') throw new Error('Esta votación ya cerró.');

  const optionId = (input.optionId ?? '').trim();
  const valid = poll.options.some((o) => o.id === optionId);
  if (!valid) throw new Error('Selecciona una opción válida.');

  const email = (input.email ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error('Pon un correo válido.');
  const name = input.name?.trim() || null;

  // Captura el votante como lead (no truena el voto si falla).
  let leadId: string | null = null;
  try {
    const lead = await capturePublicLead({
      userId: poll.userId,
      source: 'votacion',
      publicUrl: voteUrl(slug),
      email,
      name,
    });
    leadId = lead?.id ?? null;
  } catch {
    /* la captura de lead nunca debe tronar el voto */
  }

  const inserted = await db
    .insert(pollVotes)
    .values({ pollId: poll.id, optionId, name, email, leadId })
    .onConflictDoNothing({ target: [pollVotes.pollId, pollVotes.email] })
    .returning({ id: pollVotes.id });

  const didVote = inserted.length > 0;
  if (didVote) {
    await db.update(polls).set({ totalVotes: sql`${polls.totalVotes} + 1` }).where(eq(polls.id, poll.id));
  }

  const tally = await getPollTally(poll.id);
  return { ok: true, already: !didVote, tally };
}

export type ClosePollResult = { winner: PollOption | null; notified: number };

export async function closePoll(userId: string, id: string): Promise<ClosePollResult> {
  const [poll] = await db
    .select()
    .from(polls)
    .where(and(eq(polls.userId, userId), eq(polls.id, id)))
    .limit(1);
  if (!poll) throw new Error('Votación no encontrada.');

  const tally = await getPollTally(poll.id);
  // Opcion ganadora: la de mas votos (respeta el orden de opciones como desempate).
  let winner: PollOption | null = null;
  let best = -1;
  for (const opt of poll.options) {
    const c = tally[opt.id] ?? 0;
    if (c > best) {
      best = c;
      winner = opt;
    }
  }

  await db
    .update(polls)
    .set({ status: 'closed', closedAt: new Date(), winnerOptionId: winner?.id ?? null })
    .where(and(eq(polls.userId, userId), eq(polls.id, id)));

  // Avisa por correo a todos los votantes que ganó X producto.
  let notified = 0;
  if (winner && isResendConfigured()) {
    const [u] = await db.select({ brandName: users.brandName }).from(users).where(eq(users.id, userId)).limit(1);
    const brand = u?.brandName ?? null;

    const voters = await db
      .select({ email: pollVotes.email, name: pollVotes.name })
      .from(pollVotes)
      .where(eq(pollVotes.pollId, poll.id));

    for (const v of voters) {
      if (!v.email || !isValidEmail(v.email)) continue;
      const hi = v.name?.trim() ? `Hola ${v.name.trim()},` : 'Hola,';
      const body = `${hi}

¡Ya tenemos ganador! En la votación "${poll.question}" la opción más votada fue:

🏆 ${winner.label}${winner.description ? `\n${winner.description}` : ''}

Gracias por ser parte de la decisión. Este es el producto que vamos a lanzar — te avisaremos en cuanto esté listo.

¡Nos vemos pronto!`;
      try {
        const res = await sendEmail({
          to: v.email,
          subject: `Ganó: ${winner.label}`,
          html: emailHtml(body, brand),
          text: body,
        });
        if (res.ok) notified += 1;
      } catch {
        /* no tronar el cierre por un correo que falle */
      }
    }
  }

  return { winner, notified };
}

export async function deletePoll(userId: string, id: string): Promise<void> {
  await db.delete(polls).where(and(eq(polls.userId, userId), eq(polls.id, id)));
}
