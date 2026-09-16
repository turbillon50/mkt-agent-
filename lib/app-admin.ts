import 'server-only';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionQueue,
  campaigns,
  conversations,
  messages,
  orgMemberships,
  organizations,
  salesLeads,
  users,
  type Organization,
  type User,
} from '@/src/db/schema';
import { channelStatus } from '@/lib/projects';
import { activeRuleCount } from '@/src/rules';
import { listOrgs, membershipsByUsers, webhookHealth } from '@/src/orgs/repo';

/**
 * Datos del MÓDULO DE ADMINISTRACIÓN DE LA APP (`/admin`).
 *
 * Es la vista de Luis como DUEÑO DE GOOSSIP, por encima de todas las
 * organizaciones. Nada de aquí se filtra por org a propósito: ese es el punto.
 * La puerta es `users.is_admin` y se revisa del lado del servidor en cada ruta.
 */

export interface Usage {
  leads: number;
  messages: number;
  actions: number;
}

const ZERO: Usage = { leads: 0, messages: 0, actions: 0 };

function monthStart(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Uso del mes en curso, por organización. */
export async function usageByOrg(): Promise<Map<string, Usage>> {
  const since = monthStart();
  const [leadRows, msgRows, actionRows] = await Promise.all([
    db
      .select({ orgId: salesLeads.orgId, c: sql<number>`count(*)::int` })
      .from(salesLeads)
      .where(gte(salesLeads.createdAt, since))
      .groupBy(salesLeads.orgId),
    db
      .select({ orgId: messages.orgId, c: sql<number>`count(*)::int` })
      .from(messages)
      .where(gte(messages.createdAt, since))
      .groupBy(messages.orgId),
    db
      .select({ orgId: actionQueue.orgId, c: sql<number>`count(*)::int` })
      .from(actionQueue)
      .where(gte(actionQueue.createdAt, since))
      .groupBy(actionQueue.orgId),
  ]);

  const out = new Map<string, Usage>();
  const bump = (id: string | null, key: keyof Usage, c: number) => {
    if (!id) return;
    const cur = out.get(id) ?? { ...ZERO };
    cur[key] = c;
    out.set(id, cur);
  };
  for (const r of leadRows) bump(r.orgId, 'leads', r.c);
  for (const r of msgRows) bump(r.orgId, 'messages', r.c);
  for (const r of actionRows) bump(r.orgId, 'actions', r.c);
  return out;
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  createdAt: Date;
  members: number;
  projects: number;
  usage: Usage;
}

/** Lista de organizaciones con lo que se ve de un vistazo. */
export async function orgList(search?: string): Promise<OrgRow[]> {
  const orgs = await listOrgs(search);
  if (orgs.length === 0) return [];
  const ids = orgs.map((o) => o.id);

  const [memberRows, projectRows, usage, owners] = await Promise.all([
    db
      .select({ orgId: orgMemberships.orgId, c: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(inArray(orgMemberships.orgId, ids))
      .groupBy(orgMemberships.orgId),
    db
      .select({ orgId: campaigns.orgId, c: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(inArray(campaigns.orgId, ids))
      .groupBy(campaigns.orgId),
    usageByOrg(),
    db
      .select({ clerkId: users.clerkId, email: users.email })
      .from(users)
      .where(inArray(users.clerkId, orgs.map((o) => o.ownerUserId ?? '').filter(Boolean))),
  ]);

  const members = new Map(memberRows.map((r) => [r.orgId, r.c]));
  const projects = new Map(projectRows.map((r) => [r.orgId, r.c]));
  const ownerEmail = new Map(owners.map((r) => [r.clerkId, r.email]));

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    status: o.status,
    ownerUserId: o.ownerUserId,
    ownerEmail: o.ownerUserId ? ownerEmail.get(o.ownerUserId) ?? null : null,
    createdAt: o.createdAt,
    members: members.get(o.id) ?? 0,
    projects: projects.get(o.id) ?? 0,
    usage: usage.get(o.id) ?? { ...ZERO },
  }));
}

export interface OrgDetail {
  org: Organization;
  usage: Usage;
  members: Array<{ clerkUserId: string; email: string | null; role: string; lastSeenAt: Date | null }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    kind: string;
    status: string;
    channels: ReturnType<typeof channelStatus>;
    rules: number;
    leads: number;
  }>;
  pending: number;
}

export async function orgDetail(orgId: string): Promise<OrgDetail | null> {
  const rows = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const org = rows[0];
  if (!org) return null;

  const [members, projects, leadCounts, pendingRows, usage] = await Promise.all([
    db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.orgId, orgId))
      .orderBy(orgMemberships.createdAt),
    db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(campaigns.createdAt),
    db
      .select({ campaignId: salesLeads.campaignId, c: sql<number>`count(*)::int` })
      .from(salesLeads)
      .where(eq(salesLeads.orgId, orgId))
      .groupBy(salesLeads.campaignId),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(actionQueue)
      .where(and(eq(actionQueue.orgId, orgId), eq(actionQueue.status, 'pending'))),
    usageByOrg(),
  ]);

  const leadsByProject = new Map(leadCounts.map((r) => [r.campaignId, r.c]));

  return {
    org,
    usage: usage.get(orgId) ?? { ...ZERO },
    members: members.map((m) => ({
      clerkUserId: m.clerkUserId,
      email: m.email,
      // El dueño se DERIVA de `owner_user_id`: en el plan gratuito de Clerk no
      // existe el rol `org:owner`. Ver src/orgs/types.ts.
      role: m.clerkUserId === org.ownerUserId ? 'org:owner' : m.role,
      lastSeenAt: m.lastSeenAt,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      kind: p.kind,
      status: p.status,
      channels: channelStatus(p),
      rules: activeRuleCount(p),
      leads: leadsByProject.get(p.id) ?? 0,
    })),
    pending: pendingRows[0]?.c ?? 0,
  };
}

export interface AdminUserRow {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  orgs: Array<{ id: string; name: string | null; slug: string | null; role: string }>;
}

export async function userList(search?: string): Promise<AdminUserRow[]> {
  const term = (search ?? '').trim().toLowerCase();
  const rows = term
    ? await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) like ${'%' + term + '%'}`)
        .orderBy(desc(users.createdAt))
    : await db.select().from(users).orderBy(desc(users.createdAt));

  const memberships = await membershipsByUsers(rows.map((u) => u.clerkId));
  const byUser = new Map<string, AdminUserRow['orgs']>();
  for (const m of memberships) {
    const list = byUser.get(m.clerkUserId) ?? [];
    list.push({ id: m.orgId, name: m.orgName, slug: m.orgSlug, role: m.role });
    byUser.set(m.clerkUserId, list);
  }

  return rows.map((u) => ({
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
    isAdmin: u.isAdmin,
    lastSeenAt: u.lastSeenAt,
    createdAt: u.createdAt,
    orgs: byUser.get(u.clerkId) ?? [],
  }));
}

export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ isAdmin, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/** Cola global: acciones de TODAS las orgs, con filtro por org y por estado. */
export async function globalQueue(opts: { orgId?: string; status?: string; limit?: number } = {}) {
  const status = opts.status ?? 'pending';
  const conds = [eq(actionQueue.status, status as never)];
  if (opts.orgId) conds.push(eq(actionQueue.orgId, opts.orgId));

  return db
    .select({
      action: actionQueue,
      projectName: campaigns.name,
      orgName: organizations.name,
      orgId: actionQueue.orgId,
      leadName: salesLeads.fullName,
    })
    .from(actionQueue)
    .innerJoin(campaigns, eq(campaigns.id, actionQueue.campaignId))
    .leftJoin(organizations, eq(organizations.id, actionQueue.orgId))
    .leftJoin(salesLeads, eq(salesLeads.id, actionQueue.leadId))
    .where(and(...conds))
    .orderBy(actionQueue.priority, desc(actionQueue.createdAt))
    .limit(opts.limit ?? 150);
}

export interface Health {
  webhooks: Array<{ source: string; ok: number; error: number; rejected: number; last: string | null }>;
  errors: Array<{ source: string; event: string | null; detail: string | null; createdAt: Date }>;
  version: {
    sha: string | null;
    ref: string | null;
    env: string | null;
    url: string | null;
  };
  totals: { orgs: number; users: number; projects: number; leads: number; conversations: number };
}

export async function appHealth(): Promise<Health> {
  const [{ rows, errors }, orgCount, userCount, projectCount, leadCount, convCount] = await Promise.all([
    webhookHealth(24),
    db.select({ c: sql<number>`count(*)::int` }).from(organizations),
    db.select({ c: sql<number>`count(*)::int` }).from(users),
    db.select({ c: sql<number>`count(*)::int` }).from(campaigns),
    db.select({ c: sql<number>`count(*)::int` }).from(salesLeads),
    db.select({ c: sql<number>`count(*)::int` }).from(conversations),
  ]);

  const bySource = new Map<string, { source: string; ok: number; error: number; rejected: number; last: string | null }>();
  for (const source of ['meta', 'whatsapp', 'clerk']) {
    bySource.set(source, { source, ok: 0, error: 0, rejected: 0, last: null });
  }
  for (const r of rows) {
    const cur = bySource.get(r.source) ?? { source: r.source, ok: 0, error: 0, rejected: 0, last: null };
    if (r.status === 'ok') cur.ok += r.c;
    else if (r.status === 'rejected') cur.rejected += r.c;
    else cur.error += r.c;
    const last = r.last ? new Date(r.last).toISOString() : null;
    if (last && (!cur.last || last > cur.last)) cur.last = last;
    bySource.set(r.source, cur);
  }

  return {
    webhooks: [...bySource.values()],
    errors: errors.map((e) => ({
      source: e.source,
      event: e.event,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
    version: {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      url: process.env.VERCEL_URL ?? null,
    },
    totals: {
      orgs: orgCount[0]?.c ?? 0,
      users: userCount[0]?.c ?? 0,
      projects: projectCount[0]?.c ?? 0,
      leads: leadCount[0]?.c ?? 0,
      conversations: convCount[0]?.c ?? 0,
    },
  };
}
