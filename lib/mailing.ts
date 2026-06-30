import 'server-only';
import { and, eq, desc, inArray, gt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  leads,
  users,
  emailLog,
  emailTemplates,
  emailCampaigns,
  emailEvents,
  type Lead,
  type EmailCampaign,
  type CampaignSegment,
} from '@/src/db/schema';
import {
  isResendConfigured,
  sendBatch,
  renderTemplate,
  campaignHtml,
  isValidEmail,
  type EmailInput,
} from './resend';

// ── Modulo inteligente de mailing (tarea 681) ────────────────────────────
// Composicion de campanas, segmentacion real, envio batched con rate-limit,
// dedup anti-spam, tracking via webhooks y opt-out. Cero numeros inventados.

const BATCH_SIZE = 100;        // Resend /emails/batch: max 100 por request
const BATCH_DELAY_MS = 600;    // < 2 req/s: respeta el rate limit de Resend
const MAX_PER_SEND = 2000;     // tope de seguridad por corrida (duracion de funcion)
const DEFAULT_DEDUPE_HOURS = 24;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function appUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://vliving.life';
  return raw.replace(/\/+$/, '');
}

function unsubscribeUrl(token: string): string {
  return `${appUrl()}/unsubscribe?token=${token}`;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Un lead es contactable si tiene correo válido, no se dio de baja y su correo no rebotó. */
export function isContactable(lead: Lead): boolean {
  if (lead.unsubscribed) return false;
  if (!lead.email || !isValidEmail(lead.email)) return false;
  if (['bounced', 'complained', 'invalid'].includes(lead.emailStatus)) return false;
  return true;
}

// ── Segmentacion ──────────────────────────────────────────────────────────
async function fetchSegmentCandidates(userId: string, segment: CampaignSegment): Promise<Lead[]> {
  if (segment.type === 'manual') {
    if (!segment.ids?.length) return [];
    return db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, userId), inArray(leads.id, segment.ids.slice(0, MAX_PER_SEND))));
  }
  if (segment.type === 'status') {
    return db.select().from(leads).where(and(eq(leads.userId, userId), eq(leads.status, segment.value)));
  }
  // all | tag → traemos todos y filtramos tag en memoria (las listas son modestas)
  const all = await db.select().from(leads).where(eq(leads.userId, userId));
  if (segment.type === 'tag') {
    const want = segment.value.trim().toLowerCase();
    return all.filter((l) => parseTags(l.tags).some((t) => t.toLowerCase() === want));
  }
  return all;
}

/** Resuelve destinatarios reales (solo contactables) de un segmento. */
export async function resolveRecipients(userId: string, segment: CampaignSegment): Promise<Lead[]> {
  const candidates = await fetchSegmentCandidates(userId, segment);
  return candidates.filter(isContactable);
}

/** Conteo REAL de destinatarios antes de mandar (nada inventado). */
export async function countRecipients(
  userId: string,
  segment: CampaignSegment,
): Promise<{ total: number; eligible: number; sample: Array<{ name: string; email: string }> }> {
  const candidates = await fetchSegmentCandidates(userId, segment);
  const eligible = candidates.filter(isContactable);
  return {
    total: candidates.length,
    eligible: eligible.length,
    sample: eligible.slice(0, 5).map((l) => ({ name: l.fullName ?? l.company ?? 'Lead', email: l.email! })),
  };
}

/** Etiquetas existentes (para el selector de segmento). */
export async function listTags(userId: string): Promise<Array<{ tag: string; count: number }>> {
  const rows = await db.select({ tags: leads.tags }).from(leads).where(eq(leads.userId, userId));
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of parseTags(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

/** Conteo de leads por etapa (para el selector de segmento). */
export async function statusCounts(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: leads.status, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.userId, userId))
    .groupBy(leads.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.count;
  return out;
}

// ── Plantillas ─────────────────────────────────────────────────────────────
export async function listTemplates(userId: string) {
  return db.select().from(emailTemplates).where(eq(emailTemplates.userId, userId)).orderBy(desc(emailTemplates.updatedAt));
}

export async function createTemplate(userId: string, input: { name: string; subject: string; body: string }) {
  const [row] = await db
    .insert(emailTemplates)
    .values({
      userId,
      name: input.name.trim() || 'Plantilla sin nombre',
      subject: input.subject ?? '',
      body: input.body ?? '',
    })
    .returning();
  return row;
}

export async function updateTemplate(
  userId: string,
  id: string,
  patch: { name?: string; subject?: string; body?: string },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.subject != null) set.subject = patch.subject;
  if (patch.body != null) set.body = patch.body;
  await db.update(emailTemplates).set(set).where(and(eq(emailTemplates.userId, userId), eq(emailTemplates.id, id)));
}

export async function deleteTemplate(userId: string, id: string) {
  await db.delete(emailTemplates).where(and(eq(emailTemplates.userId, userId), eq(emailTemplates.id, id)));
}

// ── Campanas ───────────────────────────────────────────────────────────────
function normalizeSegment(input: unknown): CampaignSegment {
  const s = input as any;
  if (s?.type === 'status' && typeof s.value === 'string') return { type: 'status', value: s.value };
  if (s?.type === 'tag' && typeof s.value === 'string') return { type: 'tag', value: s.value };
  if (s?.type === 'manual' && Array.isArray(s.ids)) return { type: 'manual', ids: s.ids.map(String).slice(0, MAX_PER_SEND) };
  return { type: 'all' };
}

export async function listCampaigns(userId: string) {
  const rows = await db
    .select()
    .from(emailCampaigns)
    .where(eq(emailCampaigns.userId, userId))
    .orderBy(desc(emailCampaigns.createdAt));
  return rows;
}

export async function getCampaign(userId: string, id: string): Promise<EmailCampaign | null> {
  const [row] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.userId, userId), eq(emailCampaigns.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createCampaign(
  userId: string,
  input: { name: string; subject: string; body: string; segment: unknown },
): Promise<EmailCampaign> {
  const [row] = await db
    .insert(emailCampaigns)
    .values({
      userId,
      name: input.name.trim() || 'Campaña sin nombre',
      subject: input.subject ?? '',
      body: input.body ?? '',
      segment: normalizeSegment(input.segment),
      status: 'draft',
    })
    .returning();
  if (!row) throw new Error('No se pudo crear la campaña.');
  return row;
}

export async function updateCampaign(
  userId: string,
  id: string,
  patch: { name?: string; subject?: string; body?: string; segment?: unknown },
): Promise<void> {
  const current = await getCampaign(userId, id);
  if (!current) throw new Error('Campaña no encontrada.');
  if (['sending', 'sent'].includes(current.status)) throw new Error('Una campaña ya enviada no se puede editar.');
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.subject != null) set.subject = patch.subject;
  if (patch.body != null) set.body = patch.body;
  if (patch.segment != null) set.segment = normalizeSegment(patch.segment);
  await db.update(emailCampaigns).set(set).where(and(eq(emailCampaigns.userId, userId), eq(emailCampaigns.id, id)));
}

export async function deleteCampaign(userId: string, id: string): Promise<void> {
  await db.delete(emailCampaigns).where(and(eq(emailCampaigns.userId, userId), eq(emailCampaigns.id, id)));
}

/** Programa una campana para enviarse despues (el cron la recoge). */
export async function scheduleCampaign(userId: string, id: string, whenISO: string): Promise<void> {
  const when = new Date(whenISO);
  if (Number.isNaN(when.getTime())) throw new Error('Fecha de programación inválida.');
  if (when.getTime() < Date.now() - 60_000) throw new Error('La fecha programada ya pasó.');
  const campaign = await getCampaign(userId, id);
  if (!campaign) throw new Error('Campaña no encontrada.');
  if (['sending', 'sent'].includes(campaign.status)) throw new Error('Esta campaña ya no se puede programar.');
  await db
    .update(emailCampaigns)
    .set({ status: 'scheduled', scheduledAt: when, updatedAt: new Date() })
    .where(and(eq(emailCampaigns.userId, userId), eq(emailCampaigns.id, id)));
}

export type SendReport = {
  campaignId: string;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  cappedAt: number | null;
};

/**
 * Envia una campana AHORA: resuelve destinatarios contactables, descarta a
 * quien ya se contactó en las últimas `dedupeHours` (anti-spam), personaliza
 * cada correo, manda por lotes de 100 respetando el rate limit de Resend y
 * registra cada envío en email_log para el tracking real.
 */
export async function sendCampaignNow(
  userId: string,
  campaignId: string,
  opts: { dedupeHours?: number } = {},
): Promise<SendReport> {
  if (!isResendConfigured()) throw new Error('El motor de correo (Resend) no está configurado.');

  const campaign = await getCampaign(userId, campaignId);
  if (!campaign) throw new Error('Campaña no encontrada.');
  if (campaign.status === 'sending') throw new Error('La campaña ya se está enviando.');
  if (campaign.status === 'sent') throw new Error('La campaña ya fue enviada.');
  if (!campaign.subject.trim() || !campaign.body.trim()) throw new Error('La campaña necesita asunto y cuerpo.');

  await db.update(emailCampaigns).set({ status: 'sending', updatedAt: new Date() }).where(eq(emailCampaigns.id, campaign.id));

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    let recipients = await resolveRecipients(userId, campaign.segment);

    // Dedup anti-spam: quita a quien ya recibió un correo reciente (cualquier
    // envío: campaña o embudo), evitando traslapes con el funnel.
    const dedupeHours = opts.dedupeHours ?? DEFAULT_DEDUPE_HOURS;
    if (dedupeHours > 0 && recipients.length > 0) {
      const since = new Date(Date.now() - dedupeHours * 3600 * 1000);
      const recent = await db
        .select({ to: emailLog.toEmail })
        .from(emailLog)
        .where(and(eq(emailLog.userId, userId), eq(emailLog.status, 'sent'), gt(emailLog.sentAt, since)));
      const recentSet = new Set(recent.map((r) => r.to.toLowerCase()));
      recipients = recipients.filter((l) => !recentSet.has(l.email!.toLowerCase()));
    }

    const totalEligible = recipients.length;
    let cappedAt: number | null = null;
    if (recipients.length > MAX_PER_SEND) {
      cappedAt = MAX_PER_SEND;
      recipients = recipients.slice(0, MAX_PER_SEND);
    }

    let sent = 0;
    let failed = 0;
    const remitente = user?.brandName ?? campaign.name;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE);
      const inputs: EmailInput[] = chunk.map((lead) => {
        const vars = { nombre: lead.fullName, empresa: lead.company ?? lead.fullName, remitente };
        const subject = renderTemplate(campaign.subject, vars);
        const bodyText = renderTemplate(campaign.body, vars);
        const unsub = unsubscribeUrl(lead.unsubscribeToken);
        return {
          to: lead.email!,
          subject,
          html: campaignHtml(bodyText, user?.brandName, unsub),
          text: `${bodyText}\n\n—\nPara darte de baja: ${unsub}`,
          unsubscribeUrl: unsub,
        };
      });

      const results = await sendBatch(inputs);

      await db.insert(emailLog).values(
        chunk.map((lead, j) => {
          const r = results[j];
          if (r?.ok) sent++;
          else failed++;
          return {
            userId,
            leadId: lead.id,
            campaignId: campaign.id,
            kind: 'campaign' as const,
            toEmail: lead.email!,
            subject: renderTemplate(campaign.subject, {
              nombre: lead.fullName,
              empresa: lead.company ?? lead.fullName,
              remitente,
            }),
            provider: 'resend',
            status: r?.ok ? 'sent' : 'failed',
            error: r?.error ?? null,
            externalId: r?.id ?? null,
          };
        }),
      );

      if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
    }

    await db
      .update(emailCampaigns)
      .set({
        status: 'sent',
        sentAt: new Date(),
        totalRecipients: totalEligible,
        sentCount: sent,
        failedCount: failed,
        skippedCount: 0,
        scheduledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaign.id));

    return { campaignId: campaign.id, recipients: totalEligible, sent, failed, skipped: 0, cappedAt };
  } catch (e) {
    await db
      .update(emailCampaigns)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaign.id));
    throw e;
  }
}

/** Procesa campanas programadas cuya hora ya llegó (lo llama el cron). */
export async function processScheduledCampaigns(): Promise<{ processed: number; reports: SendReport[] }> {
  if (!isResendConfigured()) return { processed: 0, reports: [] };
  const now = new Date();
  const due = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.status, 'scheduled'), sql`${emailCampaigns.scheduledAt} <= ${now}`))
    .limit(10);
  const reports: SendReport[] = [];
  for (const c of due) {
    try {
      reports.push(await sendCampaignNow(c.userId, c.id));
    } catch {
      // sendCampaignNow ya marcó 'failed'; no tronar el cron por una campaña
    }
  }
  return { processed: due.length, reports };
}

// ── Analytics real (tarea 681 punto 4) ────────────────────────────────────
export type CampaignAnalytics = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  rates: { delivered: number; opened: number; clicked: number; bounced: number };
};

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export async function campaignAnalytics(userId: string, campaignId: string): Promise<CampaignAnalytics> {
  const rows = await db
    .select({
      status: emailLog.status,
      delivered: emailLog.deliveredAt,
      opened: emailLog.openedAt,
      clicked: emailLog.clickedAt,
      bounced: emailLog.bouncedAt,
      complained: emailLog.complainedAt,
    })
    .from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.campaignId, campaignId)));

  const sent = rows.filter((r) => r.status === 'sent').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const delivered = rows.filter((r) => r.delivered).length;
  const opened = rows.filter((r) => r.opened).length;
  const clicked = rows.filter((r) => r.clicked).length;
  const bounced = rows.filter((r) => r.bounced).length;
  const complained = rows.filter((r) => r.complained).length;

  return {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    failed,
    rates: {
      delivered: pct(delivered, sent),
      opened: pct(opened, delivered || sent),
      clicked: pct(clicked, delivered || sent),
      bounced: pct(bounced, sent),
    },
  };
}

/** Resumen global del mailing para el dashboard. */
export async function mailingOverview(userId: string) {
  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${emailLog.status} = 'sent')::int`,
      opened: sql<number>`count(*) filter (where ${emailLog.openedAt} is not null)::int`,
      clicked: sql<number>`count(*) filter (where ${emailLog.clickedAt} is not null)::int`,
      bounced: sql<number>`count(*) filter (where ${emailLog.bouncedAt} is not null)::int`,
    })
    .from(emailLog)
    .where(eq(emailLog.userId, userId));
  const [unsub] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.userId, userId), eq(leads.unsubscribed, true)));
  return {
    sent: agg?.sent ?? 0,
    opened: agg?.opened ?? 0,
    clicked: agg?.clicked ?? 0,
    bounced: agg?.bounced ?? 0,
    unsubscribed: unsub?.count ?? 0,
  };
}

// ── Webhooks de Resend (tracking + manejo de rebotes/quejas) ──────────────
type ResendEvent = {
  type?: string;
  data?: { email_id?: string; to?: string | string[]; [k: string]: unknown };
};

/** Registra un evento de Resend y actualiza el email_log + salud del lead. */
export async function recordResendEvent(payload: ResendEvent): Promise<{ ok: boolean; matched: boolean }> {
  const type = payload?.type ?? '';
  const emailId = payload?.data?.email_id ?? null;
  const toRaw = payload?.data?.to;
  const to = Array.isArray(toRaw) ? toRaw[0] : toRaw ?? null;

  // Auditoría cruda siempre (idempotencia + evidencia).
  await db.insert(emailEvents).values({ externalId: emailId, type, toEmail: to ?? null, payload: payload as any });

  if (!emailId) return { ok: true, matched: false };

  const [row] = await db.select().from(emailLog).where(eq(emailLog.externalId, emailId)).limit(1);
  if (!row) return { ok: true, matched: false };

  const now = new Date();
  const set: Record<string, unknown> = {};
  switch (type) {
    case 'email.delivered':
      set.deliveredAt = row.deliveredAt ?? now;
      break;
    case 'email.opened':
      set.openedAt = row.openedAt ?? now;
      set.openCount = (row.openCount ?? 0) + 1;
      break;
    case 'email.clicked':
      set.clickedAt = row.clickedAt ?? now;
      set.clickCount = (row.clickCount ?? 0) + 1;
      break;
    case 'email.bounced':
      set.bouncedAt = row.bouncedAt ?? now;
      break;
    case 'email.complained':
      set.complainedAt = row.complainedAt ?? now;
      break;
    default:
      return { ok: true, matched: true };
  }
  await db.update(emailLog).set(set).where(eq(emailLog.id, row.id));

  // Salud del lead: rebote => correo inválido; queja => baja inmediata.
  if (row.leadId && (type === 'email.bounced' || type === 'email.complained')) {
    const leadSet: Record<string, unknown> =
      type === 'email.bounced'
        ? { emailStatus: 'bounced', updatedAt: now }
        : { emailStatus: 'complained', unsubscribed: true, unsubscribedAt: now, updatedAt: now };
    await db.update(leads).set(leadSet).where(eq(leads.id, row.leadId));
  }
  return { ok: true, matched: true };
}

// ── Opt-out / unsubscribe ──────────────────────────────────────────────────
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email: string | null }> {
  const [lead] = await db.select().from(leads).where(eq(leads.unsubscribeToken, token)).limit(1);
  if (!lead) return { ok: false, email: null };
  if (!lead.unsubscribed) {
    await db
      .update(leads)
      .set({ unsubscribed: true, unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
  }
  return { ok: true, email: lead.email };
}
