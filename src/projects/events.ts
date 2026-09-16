/**
 * Bitácora del proyecto: quién conectó, quién revocó, a quién invitaron y qué
 * rol le cambiaron. Es la respuesta a "¿y esto quién lo movió?".
 *
 * Nunca tumba la operación: si el registro falla, la acción ya pasó. Perder una
 * línea de bitácora es malo; perder la conexión del cliente porque la bitácora
 * tronó es peor.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { projectEvents, type ProjectEvent } from '../db/schema';
import type { ProjectEventType } from './types';

export type { ProjectEvent };

export interface LogProjectEventInput {
  orgId: string;
  projectId: string;
  type: ProjectEventType;
  actor?: string | null;
  actorEmail?: string | null;
  payload?: Record<string, unknown>;
}

export async function logProjectEvent(input: LogProjectEventInput): Promise<void> {
  await db
    .insert(projectEvents)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      type: input.type,
      actor: input.actor ?? 'goossip',
      actorEmail: input.actorEmail ?? null,
      payload: input.payload ?? {},
    })
    .catch(() => undefined);
}

export async function listProjectEvents(
  orgId: string,
  projectId: string,
  limit = 30,
): Promise<ProjectEvent[]> {
  return db
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.orgId, orgId), eq(projectEvents.projectId, projectId)))
    .orderBy(desc(projectEvents.createdAt))
    .limit(limit);
}
