/**
 * Espejo de organizaciones y membresías de Clerk.
 *
 * Vive en src/ (no en lib/) para que los scripts de tsx y las pruebas lo puedan
 * usar fuera de Next: `server-only` los rompería. lib/orgs.ts lo re-exporta.
 *
 * Regla: Clerk manda. Esta tabla es caché consultable — nunca es la fuente de
 * verdad de quién pertenece a qué.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  campaigns,
  orgMemberships,
  organizations,
  users,
  webhookLog,
  type Organization,
  type OrgMembership,
} from '../db/schema';
import {
  isOrgPlan,
  isOrgRole,
  isOrgStatus,
  type OrgPlan,
  type OrgRole,
  type OrgStatus,
  type WebhookSource,
} from './types';

export type { Organization, OrgMembership };

// ---------------------------------------------------------------------------
// Organizaciones
// ---------------------------------------------------------------------------

export async function getOrg(orgId: string): Promise<Organization | null> {
  const rows = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return rows[0] ?? null;
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const rows = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function listOrgs(search?: string): Promise<Organization[]> {
  const term = (search ?? '').trim().toLowerCase();
  const base = db.select().from(organizations);
  const rows = term
    ? await base
        .where(sql`lower(${organizations.name}) like ${'%' + term + '%'} or lower(coalesce(${organizations.slug}, '')) like ${'%' + term + '%'}`)
        .orderBy(desc(organizations.createdAt))
    : await base.orderBy(desc(organizations.createdAt));
  return rows;
}

/**
 * Alta o actualización del espejo. Lo llama el webhook de Clerk y también el
 * contexto de request: si el token trae una org que todavía no está espejada
 * (webhook perdido, org creada antes de esta corrida), se crea al vuelo en vez
 * de dejar al usuario fuera de su propia app.
 */
export async function upsertOrg(input: {
  id: string;
  name: string;
  slug?: string | null;
  ownerUserId?: string | null;
  plan?: OrgPlan;
  status?: OrgStatus;
  settings?: Record<string, unknown>;
  createdAt?: Date;
}): Promise<Organization> {
  const [row] = await db
    .insert(organizations)
    .values({
      id: input.id,
      name: input.name,
      slug: input.slug ?? null,
      ownerUserId: input.ownerUserId ?? null,
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.settings ? { settings: input.settings } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: {
        name: input.name,
        slug: input.slug ?? null,
        // El dueño no se pisa con null: Clerk no manda `created_by` en updates.
        ownerUserId: sql`coalesce(${input.ownerUserId ?? null}, ${organizations.ownerUserId})`,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error('No se pudo guardar la organización.');
  return row;
}

export async function setOrgPlan(orgId: string, plan: OrgPlan): Promise<Organization | null> {
  if (!isOrgPlan(plan)) throw new Error(`Plan inválido: ${plan}`);
  const [row] = await db
    .update(organizations)
    .set({ plan, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
  return row ?? null;
}

export async function setOrgStatus(orgId: string, status: OrgStatus): Promise<Organization | null> {
  if (!isOrgStatus(status)) throw new Error(`Estado inválido: ${status}`);
  const [row] = await db
    .update(organizations)
    .set({ status, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();
  return row ?? null;
}

/** Borra el espejo. Los datos de la org caen por FK o quedan sin org viva. */
export async function deleteOrg(orgId: string): Promise<void> {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

// ---------------------------------------------------------------------------
// Membresías
// ---------------------------------------------------------------------------

export async function upsertMembership(input: {
  id: string;
  orgId: string;
  clerkUserId: string;
  email?: string | null;
  role?: string | null;
}): Promise<OrgMembership | null> {
  const role: OrgRole = isOrgRole(input.role) ? input.role : 'org:member';
  const [row] = await db
    .insert(orgMemberships)
    .values({
      id: input.id,
      orgId: input.orgId,
      clerkUserId: input.clerkUserId,
      email: input.email ?? null,
      role,
    })
    .onConflictDoUpdate({
      target: [orgMemberships.orgId, orgMemberships.clerkUserId],
      set: { role, email: input.email ?? null, updatedAt: new Date() },
    })
    .returning();
  return row ?? null;
}

export async function deleteMembership(orgId: string, clerkUserId: string): Promise<void> {
  await db
    .delete(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.clerkUserId, clerkUserId)));
}

export async function getMembership(orgId: string, clerkUserId: string): Promise<OrgMembership | null> {
  const rows = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.clerkUserId, clerkUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMemberships(orgId: string): Promise<OrgMembership[]> {
  return db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.orgId, orgId))
    .orderBy(orgMemberships.createdAt);
}

export async function listMembershipsForUser(clerkUserId: string): Promise<
  Array<OrgMembership & { orgName: string | null; orgSlug: string | null }>
> {
  const rows = await db
    .select({ m: orgMemberships, orgName: organizations.name, orgSlug: organizations.slug })
    .from(orgMemberships)
    .leftJoin(organizations, eq(organizations.id, orgMemberships.orgId))
    .where(eq(orgMemberships.clerkUserId, clerkUserId));
  return rows.map((r) => ({ ...r.m, orgName: r.orgName, orgSlug: r.orgSlug }));
}

/** Membresías de varios usuarios de un jalón — para la lista de /admin. */
export async function membershipsByUsers(clerkUserIds: string[]) {
  if (clerkUserIds.length === 0) return [];
  return db
    .select({
      clerkUserId: orgMemberships.clerkUserId,
      orgId: orgMemberships.orgId,
      role: orgMemberships.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(orgMemberships)
    .leftJoin(organizations, eq(organizations.id, orgMemberships.orgId))
    .where(inArray(orgMemberships.clerkUserId, clerkUserIds));
}

/**
 * Deja constancia del paso del usuario por la org y devuelve la membresía.
 * Si el webhook no llegó todavía, la crea con lo que trae el token: sin esto
 * el proyecto activo por (user, org) no tendría dónde vivir.
 */
export async function touchMembership(input: {
  orgId: string;
  clerkUserId: string;
  email?: string | null;
  role?: string | null;
}): Promise<OrgMembership | null> {
  const role: OrgRole = isOrgRole(input.role) ? input.role : 'org:member';
  const now = new Date();
  const [row] = await db
    .insert(orgMemberships)
    .values({
      id: `local:${input.orgId}:${input.clerkUserId}`,
      orgId: input.orgId,
      clerkUserId: input.clerkUserId,
      email: input.email ?? null,
      role,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [orgMemberships.orgId, orgMemberships.clerkUserId],
      set: { role, lastSeenAt: now, updatedAt: now },
    })
    .returning();
  return row ?? null;
}

export async function setActiveProjectForOrg(
  orgId: string,
  clerkUserId: string,
  projectId: string | null,
): Promise<void> {
  await db
    .update(orgMemberships)
    .set({ activeProjectId: projectId, updatedAt: new Date() })
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.clerkUserId, clerkUserId)));
}

// ---------------------------------------------------------------------------
// Bitácora de webhooks (salud de la app)
// ---------------------------------------------------------------------------

export async function logWebhook(input: {
  source: WebhookSource;
  event?: string | null;
  status?: 'ok' | 'error' | 'rejected';
  detail?: string | null;
  orgId?: string | null;
}): Promise<void> {
  // Nunca tumba la petición: es telemetría, no el trabajo.
  await db
    .insert(webhookLog)
    .values({
      source: input.source,
      event: input.event ?? null,
      status: input.status ?? 'ok',
      detail: input.detail ? input.detail.slice(0, 500) : null,
      orgId: input.orgId ?? null,
    })
    .catch(() => undefined);
}

export async function webhookHealth(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select({
      source: webhookLog.source,
      status: webhookLog.status,
      c: sql<number>`count(*)::int`,
      last: sql<Date | null>`max(${webhookLog.createdAt})`,
    })
    .from(webhookLog)
    .where(sql`${webhookLog.createdAt} >= ${since}`)
    .groupBy(webhookLog.source, webhookLog.status);

  const errors = await db
    .select()
    .from(webhookLog)
    .where(sql`${webhookLog.createdAt} >= ${since} and ${webhookLog.status} <> 'ok'`)
    .orderBy(desc(webhookLog.createdAt))
    .limit(20);

  return { rows, errors, since };
}

// ---------------------------------------------------------------------------
// Conteos para /admin
// ---------------------------------------------------------------------------

export async function orgCounts() {
  const [projects, members, appUsers] = await Promise.all([
    db
      .select({ orgId: campaigns.orgId, c: sql<number>`count(*)::int` })
      .from(campaigns)
      .groupBy(campaigns.orgId),
    db
      .select({ orgId: orgMemberships.orgId, c: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .groupBy(orgMemberships.orgId),
    db.select({ c: sql<number>`count(*)::int` }).from(users),
  ]);
  return {
    projects: new Map(projects.map((r) => [r.orgId, r.c])),
    members: new Map(members.map((r) => [r.orgId, r.c])),
    totalUsers: appUsers[0]?.c ?? 0,
  };
}
