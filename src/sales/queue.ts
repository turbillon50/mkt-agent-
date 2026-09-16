/**
 * Cola de acciones. TODO lo que Goossip quiere hacer pasa por aquí antes de
 * salir: así el dueño ve qué se va a mandar, por qué, y puede frenarlo.
 */
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { actionQueue, type NewQueuedAction, type QueuedAction } from '../db/schema';
import type { ActionKind, ActionStatus } from './types';

export interface EnqueueInput {
  orgId: string;
  campaignId: string;
  leadId?: string | null;
  kind: ActionKind;
  payload?: Record<string, unknown>;
  /** 1 = lo más urgente. Por defecto 5. */
  priority?: number;
  /** `pending` espera aprobación; `auto` lo ejecuta el runner sin preguntar. */
  status?: Extract<ActionStatus, 'pending' | 'auto'>;
  /** La señal que lo generó. Es lo que lee el dueño en /automations. */
  reason: string;
  scheduledFor?: Date;
  createdBy: string;
}

/**
 * Encola. Si ya hay una acción de la misma regla esperando para el mismo lead,
 * el índice parcial `action_queue_pending_rule_uniq` la rechaza y devolvemos
 * null: sin esto el cron de cada minuto haría cola infinita.
 */
export async function enqueue(input: EnqueueInput): Promise<QueuedAction | null> {
  const values: NewQueuedAction = {
    orgId: input.orgId,
    campaignId: input.campaignId,
    leadId: input.leadId ?? null,
    kind: input.kind,
    payload: input.payload ?? {},
    priority: input.priority ?? 5,
    status: input.status ?? 'pending',
    reason: input.reason,
    scheduledFor: input.scheduledFor ?? new Date(),
    createdBy: input.createdBy,
  };
  const [row] = await db.insert(actionQueue).values(values).onConflictDoNothing().returning();
  return row ?? null;
}

/** ¿Esta regla ya actuó sobre este lead alguna vez? Evita repetir el disparo. */
export async function hasActionForLead(
  leadId: string,
  kind: ActionKind,
  createdBy?: string,
): Promise<boolean> {
  const where = createdBy
    ? and(eq(actionQueue.leadId, leadId), eq(actionQueue.kind, kind), eq(actionQueue.createdBy, createdBy))
    : and(eq(actionQueue.leadId, leadId), eq(actionQueue.kind, kind));
  const rows = await db.select({ id: actionQueue.id }).from(actionQueue).where(where).limit(1);
  return rows.length > 0;
}

export async function getAction(id: string): Promise<QueuedAction | null> {
  const rows = await db.select().from(actionQueue).where(eq(actionQueue.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listQueue(
  campaignId: string,
  statuses: ActionStatus[] = ['pending', 'approved', 'auto'],
  limit = 200,
): Promise<QueuedAction[]> {
  return db
    .select()
    .from(actionQueue)
    .where(and(eq(actionQueue.campaignId, campaignId), inArray(actionQueue.status, statuses)))
    .orderBy(actionQueue.priority, desc(actionQueue.createdAt))
    .limit(limit);
}

export async function setStatus(
  id: string,
  status: ActionStatus,
  extra: { approvedBy?: string | null; result?: Record<string, unknown>; executedAt?: Date } = {},
): Promise<QueuedAction | null> {
  const patch: Record<string, unknown> = { status };
  if (extra.approvedBy !== undefined) patch.approvedBy = extra.approvedBy;
  if (extra.result !== undefined) patch.result = extra.result;
  if (extra.executedAt !== undefined) patch.executedAt = extra.executedAt;
  const [row] = await db.update(actionQueue).set(patch).where(eq(actionQueue.id, id)).returning();
  return row ?? null;
}

/**
 * Lo que toca ejecutar ahora: `approved` (el dueño le dio tap) o `auto` (la
 * regla lo permite sin aprobación), con la hora ya cumplida.
 */
export async function dueActions(limit: number): Promise<QueuedAction[]> {
  return db
    .select()
    .from(actionQueue)
    .where(and(inArray(actionQueue.status, ['approved', 'auto']), lte(actionQueue.scheduledFor, new Date())))
    .orderBy(actionQueue.priority, actionQueue.scheduledFor)
    .limit(limit);
}

/** Conteo global por estado — lo usa el panel de agencia. */
export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: actionQueue.status, c: sql<number>`count(*)::int` })
    .from(actionQueue)
    .groupBy(actionQueue.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}
