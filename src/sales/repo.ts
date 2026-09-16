/**
 * Acceso a datos del super vendedor: leads, bitácora, conversaciones y mensajes.
 *
 * Vive en src/ (no en lib/) a propósito: el script de importación one-shot lo
 * usa desde tsx, fuera de Next, y `server-only` lo rompería.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  conversations,
  messages,
  salesLeadEvents,
  salesLeads,
  type Conversation,
  type Message,
  type NewSalesLead,
  type SalesLead,
  type SalesLeadEvent,
} from '../db/schema';
import { isForwardStage, type DeliveryStatus, type EventType, type LeadStage } from './types';

/** Ventana de servicio de WhatsApp: 24 h desde el último inbound del cliente. */
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface UpsertLeadResult {
  lead: SalesLead;
  created: boolean;
}

/**
 * Inserta el lead; si ya existe (mismo teléfono o mismo source_ref en el
 * proyecto) devuelve el existente SIN pisarlo. Regla de Luis: nunca se
 * sobrescribe lo que un humano ya movió.
 */
export async function upsertLead(input: NewSalesLead): Promise<UpsertLeadResult> {
  const existing = await findExistingLead(input.campaignId, input.phone ?? null, input.sourceRef ?? null, input.source);
  if (existing) return { lead: existing, created: false };

  try {
    const [row] = await db.insert(salesLeads).values(input).returning();
    if (!row) throw new Error('No se pudo insertar el lead.');
    await recordEvent({
      leadId: row.id,
      type: 'created',
      toStage: row.stage,
      actor: 'goossip',
      payload: { source: row.source, score: row.score, grade: row.grade },
    });
    return { lead: row, created: true };
  } catch (e) {
    // Carrera entre dos webhooks para el mismo lead: gana el primero.
    const again = await findExistingLead(input.campaignId, input.phone ?? null, input.sourceRef ?? null, input.source);
    if (again) return { lead: again, created: false };
    throw e;
  }
}

async function findExistingLead(
  campaignId: string,
  phone: string | null,
  sourceRef: string | null,
  source: string | undefined,
): Promise<SalesLead | null> {
  if (sourceRef && source) {
    const bySource = await db
      .select()
      .from(salesLeads)
      .where(
        and(
          eq(salesLeads.campaignId, campaignId),
          eq(salesLeads.source, source as SalesLead['source']),
          eq(salesLeads.sourceRef, sourceRef),
        ),
      )
      .limit(1);
    if (bySource[0]) return bySource[0];
  }
  if (phone) {
    const byPhone = await db
      .select()
      .from(salesLeads)
      .where(and(eq(salesLeads.campaignId, campaignId), eq(salesLeads.phone, phone)))
      .limit(1);
    if (byPhone[0]) return byPhone[0];
  }
  return null;
}

export async function getLead(id: string): Promise<SalesLead | null> {
  const rows = await db.select().from(salesLeads).where(eq(salesLeads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findLeadByPhone(campaignId: string, phone: string): Promise<SalesLead | null> {
  const rows = await db
    .select()
    .from(salesLeads)
    .where(and(eq(salesLeads.campaignId, campaignId), eq(salesLeads.phone, phone)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLeadsByProject(
  campaignId: string,
  opts: { limit?: number; stages?: LeadStage[] } = {},
): Promise<SalesLead[]> {
  const where =
    opts.stages && opts.stages.length > 0
      ? and(eq(salesLeads.campaignId, campaignId), inArray(salesLeads.stage, opts.stages))
      : eq(salesLeads.campaignId, campaignId);
  return db
    .select()
    .from(salesLeads)
    .where(where)
    .orderBy(desc(salesLeads.score), desc(salesLeads.createdAt))
    .limit(opts.limit ?? 500);
}

export async function setPhoneValidation(
  leadId: string,
  validation: SalesLead['phoneValidation'],
): Promise<void> {
  await db
    .update(salesLeads)
    .set({ phoneValidation: validation, updatedAt: new Date() })
    .where(eq(salesLeads.id, leadId));
}

/**
 * Mueve el stage y deja evento. `force` lo usa el humano desde el panel; el
 * vendedor solo avanza (isForwardStage) para no borrar trabajo de un asesor.
 */
export async function moveStage(
  leadId: string,
  to: LeadStage,
  actor: string,
  opts: { force?: boolean; payload?: Record<string, unknown> } = {},
): Promise<SalesLead | null> {
  const lead = await getLead(leadId);
  if (!lead) return null;
  if (lead.stage === to) return lead;
  if (!opts.force && !isForwardStage(lead.stage, to)) return lead;

  const [row] = await db
    .update(salesLeads)
    .set({ stage: to, updatedAt: new Date() })
    .where(eq(salesLeads.id, leadId))
    .returning();
  await recordEvent({
    leadId,
    type: 'stage_change',
    fromStage: lead.stage,
    toStage: to,
    actor,
    payload: opts.payload,
  });
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------------

export async function recordEvent(input: {
  leadId: string;
  type: EventType;
  fromStage?: LeadStage | null;
  toStage?: LeadStage | null;
  actor: string;
  payload?: Record<string, unknown>;
}): Promise<SalesLeadEvent | null> {
  const [row] = await db
    .insert(salesLeadEvents)
    .values({
      leadId: input.leadId,
      type: input.type,
      fromStage: input.fromStage ?? null,
      toStage: input.toStage ?? null,
      actor: input.actor,
      payload: input.payload ?? null,
    })
    .returning();
  return row ?? null;
}

export async function listEvents(leadId: string, limit = 50): Promise<SalesLeadEvent[]> {
  return db
    .select()
    .from(salesLeadEvents)
    .where(eq(salesLeadEvents.leadId, leadId))
    .orderBy(desc(salesLeadEvents.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Conversaciones y mensajes
// ---------------------------------------------------------------------------

export async function getOrCreateConversation(input: {
  campaignId: string;
  leadId: string | null;
  channel: 'whatsapp' | 'sms' | 'email';
  externalThreadId: string;
}): Promise<Conversation> {
  const found = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.campaignId, input.campaignId),
        eq(conversations.channel, input.channel),
        eq(conversations.externalThreadId, input.externalThreadId),
      ),
    )
    .limit(1);
  if (found[0]) {
    if (!found[0].leadId && input.leadId) {
      const [patched] = await db
        .update(conversations)
        .set({ leadId: input.leadId, updatedAt: new Date() })
        .where(eq(conversations.id, found[0].id))
        .returning();
      return patched ?? found[0];
    }
    return found[0];
  }

  const [row] = await db
    .insert(conversations)
    .values({
      campaignId: input.campaignId,
      leadId: input.leadId,
      channel: input.channel,
      externalThreadId: input.externalThreadId,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;

  const again = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.campaignId, input.campaignId),
        eq(conversations.channel, input.channel),
        eq(conversations.externalThreadId, input.externalThreadId),
      ),
    )
    .limit(1);
  if (!again[0]) throw new Error('No se pudo abrir la conversación.');
  return again[0];
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findConversationByLead(
  leadId: string,
  channel: 'whatsapp' | 'sms' | 'email' = 'whatsapp',
): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.leadId, leadId), eq(conversations.channel, channel)))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Marca inbound y reabre la ventana de 24 h. */
export async function touchInbound(conversationId: string, at: Date): Promise<Conversation | null> {
  const [row] = await db
    .update(conversations)
    .set({
      lastInboundAt: at,
      windowExpiresAt: new Date(at.getTime() + WA_WINDOW_MS),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId))
    .returning();
  return row ?? null;
}

export async function touchOutbound(conversationId: string, at: Date): Promise<void> {
  await db
    .update(conversations)
    .set({ lastOutboundAt: at, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function setConversationStatus(
  conversationId: string,
  status: 'open' | 'escalated' | 'closed',
): Promise<void> {
  await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/** ¿Se puede mandar texto libre, o hay que usar plantilla? */
export function windowIsOpen(conversation: Conversation, now = new Date()): boolean {
  return Boolean(conversation.windowExpiresAt && conversation.windowExpiresAt.getTime() > now.getTime());
}

export async function insertMessage(input: {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  media?: Message['media'];
  templateName?: string | null;
  externalId?: string | null;
  deliveryStatus?: DeliveryStatus | null;
  respondedBy?: string | null;
  createdAt?: Date;
}): Promise<Message | null> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      direction: input.direction,
      body: input.body,
      media: input.media ?? null,
      templateName: input.templateName ?? null,
      externalId: input.externalId ?? null,
      deliveryStatus: input.deliveryStatus ?? null,
      respondedBy: input.respondedBy ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function listMessages(conversationId: string, limit = 50): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit);
}

/** Status update de Cloud API: sent → delivered → read, o failed. */
export async function updateDeliveryStatus(
  externalId: string,
  status: DeliveryStatus,
): Promise<Message | null> {
  const [row] = await db
    .update(messages)
    .set({ deliveryStatus: status })
    .where(and(eq(messages.externalId, externalId), isNotNull(messages.externalId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Conteos para el panel de agencia
// ---------------------------------------------------------------------------

export async function countLeadsByStage(campaignId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ stage: salesLeads.stage, c: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(eq(salesLeads.campaignId, campaignId))
    .groupBy(salesLeads.stage);
  return Object.fromEntries(rows.map((r) => [r.stage, r.c]));
}
