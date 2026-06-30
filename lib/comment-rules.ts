import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { commentRules, type CommentRule } from '@/src/db/schema';
import { capturePublicLead } from './public-leads';

// ── FEATURE #1 — Venta por comentario ─────────────────────────────────────
// El influencer define reglas: si un comentario en una red trae palabras de
// compra ("quiero", "precio", "info"…), respondemos automatico con un mensaje
// + link de pago/landing, y guardamos al comentarista como lead nuevo con
// fuente=comentario. El webhook publico /api/webhooks/comments recibe los
// comentarios de la red (via Composio) y entrega la respuesta.

export async function listRules(userId: string): Promise<CommentRule[]> {
  return db
    .select()
    .from(commentRules)
    .where(eq(commentRules.userId, userId))
    .orderBy(desc(commentRules.createdAt));
}

export type CreateRuleInput = {
  name: string;
  platform?: string;
  keywords: string[];
  replyMessage: string;
  paymentLink?: string | null;
};

export async function createRule(userId: string, input: CreateRuleInput): Promise<CommentRule> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('La regla necesita un nombre.');
  const keywords = cleanKeywords(input.keywords);
  if (keywords.length === 0) throw new Error('Agrega al menos una palabra clave.');
  const replyMessage = (input.replyMessage ?? '').trim();
  if (!replyMessage) throw new Error('Escribe el mensaje de respuesta.');

  const [row] = await db
    .insert(commentRules)
    .values({
      userId,
      name,
      platform: (input.platform?.trim() || 'instagram').toLowerCase(),
      keywords,
      replyMessage,
      paymentLink: input.paymentLink?.trim() || null,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear la regla.');
  return row;
}

export type UpdateRuleInput = Partial<{
  name: string;
  platform: string;
  keywords: string[];
  replyMessage: string;
  paymentLink: string | null;
  active: boolean;
}>;

export async function updateRule(userId: string, id: string, patch: UpdateRuleInput): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.platform != null) set.platform = patch.platform.trim().toLowerCase();
  if (patch.keywords != null) set.keywords = cleanKeywords(patch.keywords);
  if (patch.replyMessage != null) set.replyMessage = patch.replyMessage.trim();
  if (patch.paymentLink !== undefined) set.paymentLink = patch.paymentLink?.trim() || null;
  if (patch.active != null) set.active = patch.active;
  await db.update(commentRules).set(set).where(and(eq(commentRules.userId, userId), eq(commentRules.id, id)));
}

export async function deleteRule(userId: string, id: string): Promise<void> {
  await db.delete(commentRules).where(and(eq(commentRules.userId, userId), eq(commentRules.id, id)));
}

/**
 * Devuelve la primera regla activa cuya alguna keyword aparezca como substring
 * (insensible a mayusculas/acentos) en el texto del comentario.
 */
export function matchRule(rules: CommentRule[], text: string): CommentRule | null {
  const haystack = normalize(text);
  if (!haystack) return null;
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const kw of rule.keywords ?? []) {
      const needle = normalize(kw);
      if (needle && haystack.includes(needle)) return rule;
    }
  }
  return null;
}

export type ProcessIncomingCommentInput = {
  platform: string;
  text: string;
  from: string;
  postUrl?: string | null;
};

export type ProcessIncomingCommentResult = {
  matched: boolean;
  rule?: CommentRule;
  reply?: string;
  leadId?: string;
};

/**
 * Busca entre TODAS las reglas activas (de cualquier userId) la primera que
 * matchee por plataforma + keyword. Si matchea: incrementa matchedCount, crea
 * el lead con fuente=comentario y arma la respuesta para que el webhook la
 * entregue. No publica nada por si mismo.
 */
export async function processIncomingComment(
  input: ProcessIncomingCommentInput,
): Promise<ProcessIncomingCommentResult> {
  const text = (input.text ?? '').trim();
  const from = (input.from ?? '').trim();
  const platform = (input.platform ?? 'instagram').trim().toLowerCase();
  if (!text) return { matched: false };

  const candidates = await db
    .select()
    .from(commentRules)
    .where(and(eq(commentRules.active, true), eq(commentRules.platform, platform)))
    .orderBy(desc(commentRules.createdAt));

  const rule = matchRule(candidates, text);
  if (!rule) return { matched: false };

  await db
    .update(commentRules)
    .set({ matchedCount: sql`${commentRules.matchedCount} + 1` })
    .where(eq(commentRules.id, rule.id));

  const publicUrl = input.postUrl?.trim() || `comment://${platform}/${from || 'anon'}`;
  const lead = await capturePublicLead({
    userId: rule.userId,
    source: 'comentario',
    publicUrl,
    name: from || 'Comentario',
    summary: text.slice(0, 300),
  });

  const reply = rule.replyMessage + (rule.paymentLink ? `\n\n${rule.paymentLink}` : '');

  // TODO: publicar respuesta via Composio/webhook de la red — por ahora
  // devolvemos el reply para que el webhook lo entregue.
  return { matched: true, rule, reply, leadId: lead?.id };
}

function cleanKeywords(raw: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw ?? []) {
    const v = (k ?? '').trim();
    if (!v) continue;
    const key = normalize(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** minusculas + sin acentos, para comparar de forma laxa. */
function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
