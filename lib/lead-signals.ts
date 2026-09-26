import 'server-only';
import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { leadSignals, leads, users, type Lead } from '@/src/db/schema';

// ── (7) Hot Leads ─────────────────────────────────────────────────────────
// Cada interaccion de compra (abrir correo, click, visitar referido, llenar
// landing, votar, interes por WhatsApp) suma una "senal" al lead. Cuando el
// peso acumulado cruza el umbral del usuario, se dispara UNA alerta de
// WhatsApp al numero configurado (idempotente: una sola alerta por lead).

export type HotLeadSettings = {
  threshold: number;
  alertsEnabled: boolean;
  alertWhatsappNumber: string; // solo digitos, con codigo pais
  dmAiEnabled: boolean; // usado por la feature #9 (DM IA)
};

const DEFAULTS: HotLeadSettings = {
  threshold: 3,
  alertsEnabled: true,
  alertWhatsappNumber: '',
  dmAiEnabled: true,
};

function readSettings(meta: Record<string, unknown> | null | undefined): HotLeadSettings {
  const m = (meta ?? {}) as Record<string, unknown>;
  const n = Number(m.hotLeadThreshold);
  return {
    threshold: Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULTS.threshold,
    alertsEnabled: typeof m.hotAlertsEnabled === 'boolean' ? m.hotAlertsEnabled : DEFAULTS.alertsEnabled,
    alertWhatsappNumber:
      typeof m.alertWhatsappNumber === 'string' && m.alertWhatsappNumber
        ? m.alertWhatsappNumber.replace(/\D/g, '')
        : (process.env.WHATSAPP_ALERT_TO || '').replace(/\D/g, ''),
    dmAiEnabled: typeof m.dmAiEnabled === 'boolean' ? m.dmAiEnabled : DEFAULTS.dmAiEnabled,
  };
}

export async function getHotLeadSettings(userId: string): Promise<HotLeadSettings> {
  const [u] = await db.select({ metadata: users.metadata }).from(users).where(eq(users.id, userId)).limit(1);
  return readSettings(u?.metadata);
}

export async function updateHotLeadSettings(userId: string, patch: Partial<HotLeadSettings>): Promise<HotLeadSettings> {
  const [u] = await db.select({ metadata: users.metadata }).from(users).where(eq(users.id, userId)).limit(1);
  const meta = { ...(u?.metadata ?? {}) } as Record<string, unknown>;
  if (patch.threshold != null && Number.isFinite(patch.threshold)) meta.hotLeadThreshold = Math.max(1, Math.floor(patch.threshold));
  if (patch.alertsEnabled != null) meta.hotAlertsEnabled = patch.alertsEnabled;
  if (patch.alertWhatsappNumber != null) meta.alertWhatsappNumber = patch.alertWhatsappNumber.replace(/\D/g, '');
  if (patch.dmAiEnabled != null) meta.dmAiEnabled = patch.dmAiEnabled;
  await db.update(users).set({ metadata: meta, updatedAt: new Date() }).where(eq(users.id, userId));
  return readSettings(meta);
}

const HOT_ALERT_MARKER = 'hot_alert';

const SIGNAL_LABELS: Record<string, string> = {
  email_open: 'abrió un correo',
  email_click: 'hizo click en un correo',
  referral_visit: 'visitó un link de referido',
  landing_campana: 'llenó una landing de campaña',
  referido: 'entró por un referido',
  votacion: 'votó en una co-creación',
  comentario: 'comentó pidiendo info',
  whatsapp_interest: 'mostró interés de compra por WhatsApp',
};

export type RecordSignalInput = {
  userId: string;
  leadId: string;
  type: string;
  weight?: number;
  meta?: Record<string, unknown>;
};

/**
 * Registra una senal y, si el lead cruza el umbral, dispara la alerta de
 * WhatsApp una sola vez. Nunca lanza: las fallas se tragan para no romper el
 * flujo que la llamo (captura de lead, webhook, etc.).
 */
export async function recordSignal(input: RecordSignalInput): Promise<void> {
  try {
    await db.insert(leadSignals).values({
      userId: input.userId,
      leadId: input.leadId,
      type: input.type,
      weight: Math.max(1, Math.floor(input.weight ?? 1)),
      meta: input.meta ?? null,
    });
    await maybeAlert(input.userId, input.leadId, input.type);
  } catch {
    /* silencioso a propósito */
  }
}

async function maybeAlert(userId: string, leadId: string, lastType: string): Promise<void> {
  const settings = await getHotLeadSettings(userId);
  if (!settings.alertsEnabled) return;

  // Suma de peso del lead (excluye el marcador de alerta).
  const rows = await db
    .select({ type: leadSignals.type, weight: leadSignals.weight })
    .from(leadSignals)
    .where(and(eq(leadSignals.userId, userId), eq(leadSignals.leadId, leadId)));
  const alreadyAlerted = rows.some((r) => r.type === HOT_ALERT_MARKER);
  if (alreadyAlerted) return;
  const total = rows.filter((r) => r.type !== HOT_ALERT_MARKER).reduce((a, r) => a + (r.weight ?? 1), 0);
  if (total < settings.threshold) return;

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return;

  // Marca PRIMERO (idempotencia): si dos señales entran a la vez, solo una alerta.
  await db.insert(leadSignals).values({ userId, leadId, type: HOT_ALERT_MARKER, weight: 0 });

  if (!settings.alertWhatsappNumber) return; // sin número, marca hot pero no envía

  const what = SIGNAL_LABELS[lastType] ?? lastType;
  const lines = [
    '🔥 *Lead caliente* en Goossip',
    lead.fullName ? `Nombre: ${lead.fullName}` : null,
    lead.email ? `Correo: ${lead.email}` : null,
    lead.phone ? `WhatsApp: ${lead.phone}` : null,
    `Señales acumuladas: ${total}`,
    `Última acción: ${what}`,
  ].filter(Boolean);

  try {
    const { sendViaBridge } = await import('@/src/whatsapp/bridge');
    await sendViaBridge(settings.alertWhatsappNumber, lines.join('\n'));
  } catch {
    /* el bridge puede estar caído; el lead ya quedó marcado hot */
  }
}

export type HotLead = Lead & { score: number; lastSignalAt: string | null };

export async function listHotLeads(userId: string, limit = 50): Promise<HotLead[]> {
  const settings = await getHotLeadSettings(userId);
  const agg = await db
    .select({
      leadId: leadSignals.leadId,
      score: sql<number>`coalesce(sum(case when ${leadSignals.type} = ${HOT_ALERT_MARKER} then 0 else ${leadSignals.weight} end),0)::int`,
      lastAt: sql<string>`max(${leadSignals.createdAt})`,
    })
    .from(leadSignals)
    .where(eq(leadSignals.userId, userId))
    .groupBy(leadSignals.leadId);

  const hot = agg.filter((r) => r.score >= settings.threshold).sort((a, b) => b.score - a.score).slice(0, limit);
  if (hot.length === 0) return [];

  const ids = hot.map((h) => h.leadId);
  const leadRows = await db.select().from(leads).where(and(eq(leads.userId, userId), inArray(leads.id, ids)));
  const byId = new Map(leadRows.map((l) => [l.id, l]));
  return hot
    .map((h) => {
      const l = byId.get(h.leadId);
      return l ? { ...l, score: h.score, lastSignalAt: h.lastAt } : null;
    })
    .filter((x): x is HotLead => x !== null);
}

export async function signalSummary(userId: string): Promise<{ totalSignals: number; hotCount: number }> {
  const [{ c } = { c: 0 }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(leadSignals)
    .where(and(eq(leadSignals.userId, userId), sql`${leadSignals.type} <> ${HOT_ALERT_MARKER}`));
  const hot = await listHotLeads(userId, 1000);
  return { totalSignals: c ?? 0, hotCount: hot.length };
}

export async function recentSignals(userId: string, limit = 20) {
  return db.select().from(leadSignals).where(eq(leadSignals.userId, userId)).orderBy(desc(leadSignals.createdAt)).limit(limit);
}

/** Usuario "dueño" del número de WhatsApp (bridge único). Admin primero. */
export async function getPrimaryUserId(): Promise<string | null> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).limit(1);
  if (admin) return admin.id;
  const [first] = await db.select({ id: users.id }).from(users).orderBy(users.createdAt).limit(1);
  return first?.id ?? null;
}

/**
 * (#9) Un DM de WhatsApp con interés de compra → lead caliente. Crea/actualiza
 * el lead del contacto y registra una señal fuerte que dispara la alerta (#7).
 * Respeta el toggle dmAiEnabled. Best-effort: no lanza.
 */
export async function captureWhatsappInterestLead(input: {
  from: string;
  pushName?: string | null;
  text: string;
}): Promise<{ marked: boolean }> {
  try {
    const userId = await getPrimaryUserId();
    if (!userId) return { marked: false };
    const settings = await getHotLeadSettings(userId);
    if (!settings.dmAiEnabled) return { marked: false };

    const phone = input.from.replace(/\D/g, '');
    if (!phone) return { marked: false };
    const sourceUrl = `whatsapp://${phone}`;
    const summary = input.text.slice(0, 300);

    const [lead] = await db
      .insert(leads)
      .values({
        userId,
        sourceUrl,
        platform: 'whatsapp',
        source: 'whatsapp',
        fullName: input.pushName?.trim() || null,
        phone,
        summary,
        status: 'new',
      })
      .onConflictDoUpdate({ target: [leads.userId, leads.sourceUrl], set: { summary, updatedAt: new Date() } })
      .returning();
    if (!lead) return { marked: false };

    await recordSignal({
      userId,
      leadId: lead.id,
      type: 'whatsapp_interest',
      weight: Math.max(3, settings.threshold),
      meta: { text: summary },
    });
    return { marked: true };
  } catch {
    return { marked: false };
  }
}
