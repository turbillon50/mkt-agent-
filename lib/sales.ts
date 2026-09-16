import 'server-only';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionQueue,
  campaigns,
  conversations,
  messages,
  salesLeadEvents,
  salesLeads,
  users,
  type Project,
  type SalesLead,
  type User,
} from '@/src/db/schema';
import { getProject, listProjects } from './projects';

/** Proyecto activo del usuario; si no hay, el primero que tenga. */
export async function activeProject(user: User): Promise<Project | null> {
  if (user.activeCampaignId) {
    const p = await getProject(user.id, user.activeCampaignId);
    if (p) return p;
  }
  const all = await listProjects(user.id);
  return all[0] ?? null;
}

/** Lead + su proyecto, verificando que el proyecto sea del usuario. */
export async function ownedLead(
  user: User,
  leadId: string,
): Promise<{ lead: SalesLead; project: Project } | null> {
  const rows = await db
    .select({ lead: salesLeads, project: campaigns })
    .from(salesLeads)
    .innerJoin(campaigns, eq(campaigns.id, salesLeads.campaignId))
    .where(and(eq(salesLeads.id, leadId), eq(campaigns.userId, user.id)))
    .limit(1);
  return rows[0] ?? null;
}

export interface PipelineLead extends SalesLead {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
}

export async function pipeline(campaignId: string, limit = 400): Promise<PipelineLead[]> {
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
    .where(eq(salesLeads.campaignId, campaignId))
    .orderBy(desc(salesLeads.score), desc(salesLeads.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.lead, lastInboundAt: r.lastInboundAt, lastOutboundAt: r.lastOutboundAt }));
}

export async function leadTimeline(leadId: string, limit = 40) {
  const [events, thread] = await Promise.all([
    db
      .select()
      .from(salesLeadEvents)
      .where(eq(salesLeadEvents.leadId, leadId))
      .orderBy(desc(salesLeadEvents.createdAt))
      .limit(limit),
    db
      .select({ message: messages, conversation: conversations })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.leadId, leadId))
      .orderBy(desc(messages.createdAt))
      .limit(limit),
  ]);
  return { events, messages: thread.map((t) => ({ ...t.message, channel: t.conversation.channel })) };
}

/** Cola del usuario, con el nombre del lead y del proyecto ya resueltos. */
export async function queueForUser(userId: string, statuses: string[], limit = 200) {
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
    .where(and(eq(campaigns.userId, userId), inArray(actionQueue.status, statuses as never[])))
    .orderBy(actionQueue.priority, desc(actionQueue.createdAt))
    .limit(limit);
}

export async function ownedAction(userId: string, actionId: string) {
  const rows = await db
    .select({ action: actionQueue, project: campaigns })
    .from(actionQueue)
    .innerJoin(campaigns, eq(campaigns.id, actionQueue.campaignId))
    .where(and(eq(actionQueue.id, actionId), eq(campaigns.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Panel de agencia (solo is_admin)
// ---------------------------------------------------------------------------

export interface AgencyUsage {
  leads: number;
  messages: number;
  actions: number;
}

/** Uso del mes en curso, por proyecto. */
export async function usageThisMonth(): Promise<Map<string, AgencyUsage>> {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const [leadRows, msgRows, actionRows] = await Promise.all([
    db
      .select({ id: salesLeads.campaignId, c: sql<number>`count(*)::int` })
      .from(salesLeads)
      .where(gte(salesLeads.createdAt, since))
      .groupBy(salesLeads.campaignId),
    db
      .select({ id: conversations.campaignId, c: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(gte(messages.createdAt, since))
      .groupBy(conversations.campaignId),
    db
      .select({ id: actionQueue.campaignId, c: sql<number>`count(*)::int` })
      .from(actionQueue)
      .where(gte(actionQueue.createdAt, since))
      .groupBy(actionQueue.campaignId),
  ]);

  const out = new Map<string, AgencyUsage>();
  const bump = (id: string | null, key: keyof AgencyUsage, c: number) => {
    if (!id) return;
    const cur = out.get(id) ?? { leads: 0, messages: 0, actions: 0 };
    cur[key] = c;
    out.set(id, cur);
  };
  for (const r of leadRows) bump(r.id, 'leads', r.c);
  for (const r of msgRows) bump(r.id, 'messages', r.c);
  for (const r of actionRows) bump(r.id, 'actions', r.c);
  return out;
}

export async function allTenants(): Promise<User[]> {
  return db.select().from(users).orderBy(users.createdAt);
}

export async function allProjects(): Promise<Project[]> {
  return db.select().from(campaigns).orderBy(campaigns.createdAt);
}

/** Cola global pendiente de aprobación — la vista del dueño de la agencia. */
export async function globalPendingQueue(limit = 100) {
  return db
    .select({
      action: actionQueue,
      projectName: campaigns.name,
      tenantEmail: users.email,
      leadName: salesLeads.fullName,
    })
    .from(actionQueue)
    .innerJoin(campaigns, eq(campaigns.id, actionQueue.campaignId))
    .innerJoin(users, eq(users.id, campaigns.userId))
    .leftJoin(salesLeads, eq(salesLeads.id, actionQueue.leadId))
    .where(eq(actionQueue.status, 'pending'))
    .orderBy(actionQueue.priority, desc(actionQueue.createdAt))
    .limit(limit);
}
