/**
 * Conversaciones del proyecto: los hilos abiertos con cada lead y el último
 * mensaje de cada uno.
 *
 * Lee de `conversations` y `messages`, que la corrida 1 dejó llenas por el
 * webhook de WhatsApp. Aquí no se inventa nada: si no hay hilos, no hay hilos.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { conversations, messages, salesLeads } from '../db/schema';

export interface ProjectThread {
  id: string;
  canal: 'whatsapp' | 'sms' | 'email';
  estado: 'open' | 'escalated' | 'closed';
  lead: { id: string; nombre: string | null; telefono: string | null; grado: string } | null;
  ultimoTexto: string | null;
  ultimoAt: Date | null;
  ultimoEntrante: boolean;
  /** La ventana de 24 h de WhatsApp: fuera de ella solo entran plantillas. */
  ventanaAbierta: boolean;
}

export async function projectThreads(
  orgId: string,
  projectId: string,
  limit = 60,
): Promise<ProjectThread[]> {
  const hilos = await db
    .select({ conversation: conversations, lead: salesLeads })
    .from(conversations)
    .leftJoin(salesLeads, eq(salesLeads.id, conversations.leadId))
    .where(and(eq(conversations.orgId, orgId), eq(conversations.campaignId, projectId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);

  if (hilos.length === 0) return [];

  // El último mensaje de cada hilo de un jalón: una consulta por hilo serían N
  // viajes a la base para pintar una lista.
  const ids = hilos.map((h) => h.conversation.id);
  const ultimos = await db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      direction: messages.direction,
      createdAt: messages.createdAt,
      rn: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as(
        'rn',
      ),
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .as('ultimos');

  const filas = await db
    .select({
      conversationId: ultimos.conversationId,
      body: ultimos.body,
      direction: ultimos.direction,
      createdAt: ultimos.createdAt,
    })
    .from(ultimos)
    .where(eq(ultimos.rn, 1));

  const porHilo = new Map(filas.map((f) => [f.conversationId, f]));
  const ahora = Date.now();

  return hilos.map(({ conversation, lead }) => {
    const ultimo = porHilo.get(conversation.id);
    return {
      id: conversation.id,
      canal: conversation.channel,
      estado: conversation.status,
      lead: lead
        ? { id: lead.id, nombre: lead.fullName, telefono: lead.phone, grado: lead.grade }
        : null,
      ultimoTexto: ultimo?.body?.trim() ? ultimo.body.slice(0, 160) : null,
      ultimoAt: ultimo?.createdAt ?? conversation.updatedAt,
      ultimoEntrante: ultimo?.direction === 'inbound',
      ventanaAbierta: Boolean(
        conversation.windowExpiresAt && conversation.windowExpiresAt.getTime() > ahora,
      ),
    };
  });
}
