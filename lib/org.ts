import 'server-only';
import { NextResponse } from 'next/server';
import type { User } from '@/src/db/schema';
import {
  getOrg,
  listMembershipsForUser,
  touchMembership,
  upsertOrg,
  type Organization,
  type OrgMembership,
} from '@/src/orgs/repo';
import { canManageOrg, resolveOrgRole, type OrgRole } from '@/src/orgs/types';
import { getOrCreateUser } from './users';

export type { Organization, OrgRole };

/**
 * Interruptor de Organizations.
 *
 * MEDIDO el 16-sep-2026: Organizations SÍ se pudo habilitar desde la Backend
 * API (`PATCH /v1/instance/organization_settings {"enabled":true}` → 200), así
 * que no queda ningún botón pendiente en el dashboard y la bandera viene
 * encendida por defecto.
 *
 * Con `CLERK_ORGS_ENABLED=false` la app NO se cae: deja de exigir `orgId` en el
 * token y resuelve el tenant por el espejo de membresías. Es la salida de
 * emergencia si alguien apaga Organizations en Clerk.
 */
export function orgsEnabled(): boolean {
  const v = (process.env.CLERK_ORGS_ENABLED ?? '').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
}

export interface OrgContext {
  user: User;
  clerkUserId: string;
  orgId: string;
  org: Organization;
  role: OrgRole;
  membership: OrgMembership | null;
  /** Proyecto activo por (user, org). */
  activeProjectId: string | null;
  canManage: boolean;
}

export type OrgProblem = 'unauthenticated' | 'no_org' | 'org_suspended';

export type OrgResolution =
  | { ok: true; ctx: OrgContext }
  | { ok: false; problem: OrgProblem; user: User | null };

/**
 * Contexto de la petición: usuario de la app + organización activa + rol.
 *
 * Es el único lugar donde se decide en qué tenant está parado quien pide. Todo
 * lo demás recibe `orgId` ya resuelto y filtra por él.
 */
export async function resolveOrg(): Promise<OrgResolution> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, problem: 'unauthenticated', user: null };

  const { auth } = await import('@clerk/nextjs/server');
  const session = await auth();
  const clerkUserId = user.clerkId;

  let orgId = orgsEnabled() ? (session.orgId ?? null) : null;
  let tokenRole: string | null = orgsEnabled() ? (session.orgRole ?? null) : null;

  if (!orgId) {
    // Sin org activa en el token: se intenta la única del espejo. Con la bandera
    // encendida esto solo pasa justo después de crear la org, antes de que el
    // cliente refresque la sesión.
    const mine = await listMembershipsForUser(clerkUserId);
    if (mine.length === 1) {
      orgId = mine[0].orgId;
      tokenRole = mine[0].role;
    } else if (mine.length > 1 && !orgsEnabled()) {
      orgId = mine[0].orgId;
      tokenRole = mine[0].role;
    }
  }

  if (!orgId) return { ok: false, problem: 'no_org', user };

  let org = await getOrg(orgId);
  if (!org) {
    // El webhook no llegó (o la org nació antes de la corrida 2). Se espeja al
    // vuelo desde Clerk en vez de dejar al dueño fuera de su propia app.
    org = await mirrorFromClerk(orgId);
  }
  if (!org) return { ok: false, problem: 'no_org', user };
  if (org.status === 'suspended') return { ok: false, problem: 'org_suspended', user };

  const role = resolveOrgRole(tokenRole, clerkUserId, org.ownerUserId);
  const membership = await touchMembership({
    orgId,
    clerkUserId,
    email: user.email,
    // `org:owner` no existe en Clerk gratis: al espejo va el rol real de Clerk.
    role: role === 'org:owner' ? 'org:admin' : role,
  });

  return {
    ok: true,
    ctx: {
      user,
      clerkUserId,
      orgId,
      org,
      role,
      membership,
      activeProjectId: membership?.activeProjectId ?? null,
      canManage: canManageOrg(role),
    },
  };
}

/** Espejo de emergencia: trae la org de Clerk cuando falta en la base. */
async function mirrorFromClerk(orgId: string): Promise<Organization | null> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const o = await client.organizations.getOrganization({ organizationId: orgId });
    return await upsertOrg({
      id: o.id,
      name: o.name,
      slug: o.slug ?? null,
      ownerUserId: o.createdBy ?? null,
      createdAt: o.createdAt ? new Date(o.createdAt) : undefined,
    });
  } catch {
    return null;
  }
}

/** Igual que `resolveOrg`, pero para páginas: devuelve null y ya. */
export async function orgContextOrNull(): Promise<OrgContext | null> {
  const r = await resolveOrg();
  return r.ok ? r.ctx : null;
}

// ---------------------------------------------------------------------------
// Puertas para rutas de API
// ---------------------------------------------------------------------------

export type ApiGate<T> = { ok: true; ctx: T } | { ok: false; res: NextResponse };

const PROBLEM_STATUS: Record<OrgProblem, number> = {
  unauthenticated: 401,
  no_org: 403,
  org_suspended: 403,
};

const PROBLEM_MESSAGE: Record<OrgProblem, string> = {
  unauthenticated: 'unauthorized',
  no_org: 'sin organización activa',
  org_suspended: 'la organización está suspendida',
};

/** Toda API de dashboard entra por aquí. Sin org activa, no hay datos. */
export async function apiOrg(): Promise<ApiGate<OrgContext>> {
  const r = await resolveOrg();
  if (r.ok) return { ok: true, ctx: r.ctx };
  return {
    ok: false,
    res: NextResponse.json(
      { error: PROBLEM_MESSAGE[r.problem], problem: r.problem },
      { status: PROBLEM_STATUS[r.problem] },
    ),
  };
}

/** Además del org, exige rol que pueda administrar (owner o admin). */
export async function apiOrgManager(): Promise<ApiGate<OrgContext>> {
  const gate = await apiOrg();
  if (!gate.ok) return gate;
  if (!gate.ctx.canManage) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'forbidden', problem: 'role' }, { status: 403 }),
    };
  }
  return gate;
}

/** Puerta del módulo de administración de la app. Solo `users.is_admin`. */
export async function apiAppAdmin(): Promise<ApiGate<{ user: User }>> {
  const user = await getOrCreateUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!user.isAdmin) return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { ok: true, ctx: { user } };
}
