/**
 * La gente del proyecto.
 *
 * Regla de oro: TODA consulta lleva `org_id` Y `project_id`. Un id de proyecto
 * adivinado no basta para ver nada — es el mismo candado que puso la corrida 2
 * a nivel de organización, un piso más abajo.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, projectMembers, type Project, type ProjectMember } from '../db/schema';
import { canManageOrg, type OrgRole } from '../orgs/types';
import { isProjectRole, type ProjectRole } from './types';

export type { ProjectMember };

/** El proyecto con el rol que tiene quien lo pidió. */
export interface ProjectAccess {
  project: Project;
  role: ProjectRole;
  /** true cuando el rol viene de mandar en la ORG, no de una fila propia. */
  inherited: boolean;
}

/**
 * Rol efectivo de un usuario dentro de un proyecto.
 *
 * Quien manda en la organización (`org:owner` / `org:admin`) es dueño implícito
 * de todos sus proyectos y NO necesita fila en `project_members`: si la
 * necesitara, un administrador recién invitado entraría a su propia org sin
 * poder ver nada. Para el resto, la fila es la única puerta.
 */
export async function projectRoleFor(
  orgId: string,
  projectId: string,
  clerkUserId: string,
  orgRole: OrgRole,
): Promise<{ role: ProjectRole; inherited: boolean } | null> {
  if (canManageOrg(orgRole)) return { role: 'dueño', inherited: true };
  const rows = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.clerkUserId, clerkUserId),
        eq(projectMembers.status, 'activo'),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { role: row.role, inherited: false };
}

/**
 * Los proyectos que ESTE usuario puede ver dentro de la org. No es
 * `listProjects` filtrado en el cliente: lo que no le toca nunca sale de la
 * base.
 */
export async function projectsForUser(
  orgId: string,
  clerkUserId: string,
  orgRole: OrgRole,
): Promise<ProjectAccess[]> {
  if (canManageOrg(orgRole)) {
    const all = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.orgId, orgId))
      .orderBy(campaigns.createdAt);
    return all.map((project) => ({ project, role: 'dueño' as ProjectRole, inherited: true }));
  }

  const rows = await db
    .select({ project: campaigns, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(campaigns, eq(campaigns.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.clerkUserId, clerkUserId),
        eq(projectMembers.status, 'activo'),
        eq(campaigns.orgId, orgId),
      ),
    )
    .orderBy(campaigns.createdAt);
  return rows.map((r) => ({ project: r.project, role: r.role, inherited: false }));
}

// ---------------------------------------------------------------------------
// Altas, bajas y cambios
// ---------------------------------------------------------------------------

export interface UpsertMemberInput {
  orgId: string;
  projectId: string;
  clerkUserId?: string | null;
  email?: string | null;
  role: ProjectRole;
  status?: 'invitado' | 'activo';
  invitationId?: string | null;
  invitedBy?: string | null;
}

/**
 * Alta o actualización de un miembro.
 *
 * Se resuelve a mano en vez de con `onConflictDoUpdate` porque hay DOS índices
 * únicos parciales (por usuario y por correo) y Postgres pide elegir uno solo
 * como destino del conflicto. Con dos caminos de entrada — invitación por
 * correo y aceptación con usuario — se acabaría insertando la fila duplicada.
 */
export async function upsertProjectMember(input: UpsertMemberInput): Promise<ProjectMember> {
  const email = input.email?.trim().toLowerCase() || null;
  const existing = await findMember(input.orgId, input.projectId, {
    clerkUserId: input.clerkUserId ?? null,
    email,
  });

  if (existing) {
    const [row] = await db
      .update(projectMembers)
      .set({
        role: input.role,
        status: input.status ?? existing.status,
        clerkUserId: input.clerkUserId ?? existing.clerkUserId,
        email: email ?? existing.email,
        invitationId: input.invitationId ?? existing.invitationId,
        joinedAt:
          (input.status ?? existing.status) === 'activo' ? (existing.joinedAt ?? new Date()) : existing.joinedAt,
        updatedAt: new Date(),
      })
      .where(eq(projectMembers.id, existing.id))
      .returning();
    return row;
  }

  const status = input.status ?? (input.clerkUserId ? 'activo' : 'invitado');
  const [row] = await db
    .insert(projectMembers)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      clerkUserId: input.clerkUserId ?? null,
      email,
      role: input.role,
      status,
      invitationId: input.invitationId ?? null,
      invitedBy: input.invitedBy ?? null,
      joinedAt: status === 'activo' ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error('No se pudo guardar al miembro del proyecto.');
  return row;
}

async function findMember(
  orgId: string,
  projectId: string,
  by: { clerkUserId?: string | null; email?: string | null },
): Promise<ProjectMember | null> {
  if (by.clerkUserId) {
    const rows = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.orgId, orgId),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.clerkUserId, by.clerkUserId),
        ),
      )
      .limit(1);
    if (rows[0]) return rows[0];
  }
  if (by.email) {
    const rows = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.orgId, orgId),
          eq(projectMembers.projectId, projectId),
          sql`lower(${projectMembers.email}) = ${by.email}`,
        ),
      )
      .limit(1);
    if (rows[0]) return rows[0];
  }
  return null;
}

export async function listProjectMembers(orgId: string, projectId: string): Promise<ProjectMember[]> {
  return db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.orgId, orgId), eq(projectMembers.projectId, projectId)))
    .orderBy(projectMembers.createdAt);
}

export async function getProjectMember(
  orgId: string,
  projectId: string,
  memberId: string,
): Promise<ProjectMember | null> {
  const rows = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.id, memberId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function setProjectMemberRole(
  orgId: string,
  projectId: string,
  memberId: string,
  role: ProjectRole,
): Promise<ProjectMember | null> {
  if (!isProjectRole(role)) throw new Error(`Rol inválido: ${role}`);
  const [row] = await db
    .update(projectMembers)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.id, memberId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function removeProjectMember(
  orgId: string,
  projectId: string,
  memberId: string,
): Promise<ProjectMember | null> {
  const [row] = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.id, memberId),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Cierra una invitación cuando Clerk avisa que la aceptaron. Se busca por el id
 * de la invitación porque es lo único que Clerk devuelve garantizado en el
 * webhook `organizationInvitation.accepted`.
 */
export async function acceptInvitation(
  invitationId: string,
  clerkUserId: string,
): Promise<ProjectMember[]> {
  return db
    .update(projectMembers)
    .set({ clerkUserId, status: 'activo', joinedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projectMembers.invitationId, invitationId), eq(projectMembers.status, 'invitado')))
    .returning();
}

/**
 * Red de seguridad: si el webhook de Clerk no llegó, la invitación pendiente se
 * cierra la primera vez que la persona entra con ese correo. Sin esto, un
 * webhook perdido dejaría al invitado mirando una app vacía.
 */
export async function claimPendingInvitations(
  orgId: string,
  clerkUserId: string,
  email: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 0;
  const rows = await db
    .update(projectMembers)
    .set({ clerkUserId, status: 'activo', joinedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projectMembers.orgId, orgId),
        eq(projectMembers.status, 'invitado'),
        sql`lower(${projectMembers.email}) = ${normalized}`,
      ),
    )
    .returning({ id: projectMembers.id });
  return rows.length;
}

/**
 * Cuánta gente hay en cada proyecto — para la lista de proyectos.
 *
 * Cuenta también a los invitados que todavía no entran: es lo mismo que enseña
 * la pantalla de Equipo, y dos números distintos para lo mismo en dos pantallas
 * distintas es como se pierde la confianza en un panel.
 */
export async function memberCounts(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: projectMembers.projectId, c: sql<number>`count(*)::int` })
    .from(projectMembers)
    .where(inArray(projectMembers.projectId, projectIds))
    .groupBy(projectMembers.projectId);
  return new Map(rows.map((r) => [r.projectId, r.c]));
}

/** Últimos movimientos de gente del proyecto, para la pantalla de Equipo. */
export async function recentMembers(orgId: string, projectId: string, limit = 5) {
  return db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.orgId, orgId), eq(projectMembers.projectId, projectId)))
    .orderBy(desc(projectMembers.updatedAt))
    .limit(limit);
}
