/**
 * Consultas del pipeline de ventas, TODAS con scope de organización.
 *
 * Vive en src/ (no en lib/) por la misma razón que `projects.ts`: las pruebas y
 * los scripts de tsx la usan fuera de Next, y `server-only` los revienta.
 * lib/sales.ts la re-exporta para el lado del servidor.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  actionQueue,
  campaigns,
  conversations,
  messages,
  salesLeadEvents,
  salesLeads,
  type Project,
  type SalesLead,
} from '../db/schema';
import { getProject, listProjects } from './projects';

/**
 * Proyecto activo dentro de la ORG. El activo se guarda por (user, org) en
 * `org_memberships.active_project_id`; si apunta a un proyecto de otra org o a
 * uno borrado, se cae al primero de la org — nunca se devuelve nada de fuera.
 */
export async function activeProject(
  orgId: string,
  activeProjectId: string | null,
): Promise<Project | null> {
  if (activeProjectId) {
    const p = await getProject(orgId, activeProjectId);
    if (p) return p;
  }
  const all = await listProjects(orgId);
  return all[0] ?? null;
}

/** Lead + su proyecto, verificando que el proyecto sea de ESTA organización. */
export async function ownedLead(
  orgId: string,
  leadId: string,
): Promise<{ lead: SalesLead; project: Project } | null> {
  const rows = await db
    .select({ lead: salesLeads, project: campaigns })
    .from(salesLeads)
    .innerJoin(campaigns, eq(campaigns.id, salesLeads.campaignId))
    .where(and(eq(salesLeads.id, leadId), eq(salesLeads.orgId, orgId), eq(campaigns.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface PipelineLead extends SalesLead {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
}

export async function pipeline(orgId: string, campaignId: string, limit = 400): Promise<PipelineLead[]> {
  const rows = await db
    .select({
      lead: salesLeads,
      lastInboundAt: conversations.lastInboundAt,
      lastOutboundAt: conversations.lastOutboundAt,
    })
    .from(salesLeads)
    .leftJoin(
      conversations,
      and(eq(conversations.leadId, salesLeads.id), eq(conversations.channel, 'whatsapp')),
    )
    .where(and(eq(salesLeads.orgId, orgId), eq(salesLeads.campaignId, campaignId)))
    .orderBy(desc(salesLeads.score), desc(salesLeads.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.lead, lastInboundAt: r.lastInboundAt, lastOutboundAt: r.lastOutboundAt }));
}

export async function leadTimeline(orgId: string, leadId: string, limit = 40) {
  const [events, thread] = await Promise.all([
    db
      .select()
      .from(salesLeadEvents)
      .where(and(eq(salesLeadEvents.orgId, orgId), eq(salesLeadEvents.leadId, leadId)))
      .orderBy(desc(salesLeadEvents.createdAt))
      .limit(limit),
    db
      .select({ message: messages, conversation: conversations })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.orgId, orgId), eq(conversations.leadId, leadId)))
      .orderBy(desc(messages.createdAt))
      .limit(limit),
  ]);
  return { events, messages: thread.map((t) => ({ ...t.message, channel: t.conversation.channel })) };
}

/** Cola de la ORG, con el nombre del lead y del proyecto ya resueltos. */
export async function queueForOrg(orgId: string, statuses: string[], limit = 200) {
  return db
    .select({
      action: actionQueue,
      projectName: campaigns.name,
      leadName: salesLeads.fullName,
      leadPhone: salesLeads.phone,
      leadGrade: salesLeads.grade,
    })
    .from(actionQueue)
    .innerJoin(campaigns, eq(campaigns.id, actionQueue.campaignId))
    .leftJoin(salesLeads, eq(salesLeads.id, actionQueue.leadId))
    .where(and(eq(actionQueue.orgId, orgId), inArray(actionQueue.status, statuses as never[])))
    .orderBy(actionQueue.priority, desc(actionQueue.createdAt))
    .limit(limit);
}

export async function ownedAction(orgId: string, actionId: string) {
  const rows = await db
    .select({ action: actionQueue, project: campaigns })
    .from(actionQueue)
    .innerJoin(campaigns, eq(campaigns.id, actionQueue.campaignId))
    .where(and(eq(actionQueue.id, actionId), eq(actionQueue.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}
