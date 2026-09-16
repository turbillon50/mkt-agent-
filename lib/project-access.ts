import 'server-only';
import { NextResponse } from 'next/server';
import { getProject, setActiveProject } from '@/src/sales/projects';
import { claimPendingInvitations, projectRoleFor, projectsForUser } from '@/src/projects/members';
import {
  canSeeSection,
  projectCan,
  type ProjectCapability,
  type ProjectRole,
  type ProjectSection,
} from '@/src/projects/types';
import type { Project } from '@/src/db/schema';
import { apiOrg, resolveOrg, type ApiGate, type OrgContext } from './org';

/**
 * Puerta del PROYECTO. La corrida 2 puso el candado de organización; este es el
 * de un piso más abajo.
 *
 * Tres preguntas, en este orden:
 *   1. ¿El proyecto es de esta organización?  — si no, 404. No "403": decirle
 *      "no puedes" a alguien confirma que el proyecto existe.
 *   2. ¿Esta persona tiene rol en el proyecto? — si no, 403.
 *   3. ¿Ese rol alcanza para la sección que pide? — si no, 403.
 *
 * El `conector` pasa la 2 y se atora en la 3 para todo lo que no sea Conexiones.
 * Es justo lo que pide el issue.
 */

export interface ProjectContext extends OrgContext {
  project: Project;
  projectRole: ProjectRole;
  /** El rol viene de mandar en la organización, no de una fila propia. */
  inheritedRole: boolean;
  can: (capability: ProjectCapability) => boolean;
  sees: (section: ProjectSection) => boolean;
}

export type ProjectProblem = 'no_existe' | 'sin_acceso';

export type ProjectResolution =
  | { ok: true; ctx: ProjectContext }
  | { ok: false; problem: ProjectProblem | 'org'; orgProblem?: string };

export async function resolveProject(
  projectId: string,
  section?: ProjectSection,
): Promise<ProjectResolution> {
  const org = await resolveOrg();
  if (!org.ok) return { ok: false, problem: 'org', orgProblem: org.problem };
  const ctx = org.ctx;

  const project = await getProject(ctx.orgId, projectId);
  if (!project) return { ok: false, problem: 'no_existe' };

  const resolved = await projectRoleFor(ctx.orgId, project.id, ctx.clerkUserId, ctx.role);
  if (!resolved) return { ok: false, problem: 'sin_acceso' };
  if (section && !canSeeSection(resolved.role, section)) {
    return { ok: false, problem: 'sin_acceso' };
  }

  return {
    ok: true,
    ctx: {
      ...ctx,
      project,
      projectRole: resolved.role,
      inheritedRole: resolved.inherited,
      can: (capability) => projectCan(resolved.role, capability),
      sees: (s) => canSeeSection(resolved.role, s),
    },
  };
}

/**
 * Igual, pero además deja el proyecto ACTIVO para este (usuario, org). Entrar a
 * un proyecto es elegirlo: así las pantallas heredadas — pipeline, cola,
 * conocimiento — siguen mirando al mismo sitio sin duplicar su código.
 *
 * Solo escribe cuando cambia. Un UPDATE por cada render de página sería pagar
 * una escritura por mirar.
 */
export async function enterProject(
  projectId: string,
  section?: ProjectSection,
): Promise<ProjectResolution> {
  const resolution = await resolveProject(projectId, section);
  if (resolution.ok && resolution.ctx.activeProjectId !== resolution.ctx.project.id) {
    await setActiveProject(
      resolution.ctx.orgId,
      resolution.ctx.clerkUserId,
      resolution.ctx.project.id,
    ).catch(() => undefined);
  }
  return resolution;
}

/** Para páginas: null y ya. El layout decide si es 404 o 403. */
export async function projectContextOrNull(
  projectId: string,
  section?: ProjectSection,
): Promise<ProjectContext | null> {
  const r = await resolveProject(projectId, section);
  return r.ok ? r.ctx : null;
}

// ---------------------------------------------------------------------------
// Puertas para rutas de API
// ---------------------------------------------------------------------------

/**
 * `capability` es lo que la ruta va a HACER, no lo que va a mostrar. Un GET de
 * conexiones pide 'ver'; el POST que conecta pide 'conectar'.
 */
export async function apiProject(
  projectId: string,
  opts: { section?: ProjectSection; capability?: ProjectCapability } = {},
): Promise<ApiGate<ProjectContext>> {
  const resolution = await resolveProject(projectId, opts.section);
  if (!resolution.ok) {
    // La puerta de la ORG se resuelve aquí y no antes: `resolveOrg` escribe el
    // último acceso del usuario, y llamarlo dos veces por petición es pagar dos
    // escrituras para contestar lo mismo.
    if (resolution.problem === 'org') {
      const org = await apiOrg();
      if (!org.ok) return org;
    }
    if (resolution.problem === 'no_existe') {
      return { ok: false, res: NextResponse.json({ error: 'not found' }, { status: 404 }) };
    }
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'no tienes acceso a este proyecto', problem: 'project_role' },
        { status: 403 },
      ),
    };
  }

  if (opts.capability && !resolution.ctx.can(opts.capability)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'tu rol en el proyecto no alcanza', problem: 'project_role' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, ctx: resolution.ctx };
}

/**
 * Puerta corta para las APIs de ventas que ya existían (pipeline, cola,
 * vendedor). Esas rutas resuelven el proyecto por su cuenta — desde el lead o
 * desde el proyecto activo — así que no reciben el id en la URL y no encajan
 * con `apiProject`.
 *
 * Sin esto el modelo de roles se quedaba a medias y se notaría el día que
 * importa: un `lector` entra a Leads, la propia navegación deja ese proyecto
 * activo, y desde ahí podía mover una etapa o aprobar una acción de la cola. La
 * pantalla no se lo ofrecía, pero un `fetch` sí — y esconder el botón nunca fue
 * protección.
 */
export async function requireProjectCapability(
  projectId: string,
  capability: ProjectCapability,
): Promise<NextResponse | null> {
  const resolution = await resolveProject(projectId);
  if (!resolution.ok) {
    if (resolution.problem === 'no_existe') {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'no tienes acceso a este proyecto', problem: 'project_role' },
      { status: 403 },
    );
  }
  if (!resolution.ctx.can(capability)) {
    return NextResponse.json(
      { error: 'tu rol en el proyecto no alcanza', problem: 'project_role' },
      { status: 403 },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lista de proyectos de quien pide
// ---------------------------------------------------------------------------

export interface VisibleProject {
  project: Project;
  role: ProjectRole;
  inherited: boolean;
}

/**
 * Los proyectos que esta persona ve. Si no ve ninguno se intenta cerrar sus
 * invitaciones pendientes: es exactamente el síntoma de un webhook de Clerk
 * perdido, y sin esta red el invitado se queda mirando una app vacía sin saber
 * por qué. Solo se paga esa escritura en ese caso.
 */
export async function visibleProjects(ctx: OrgContext): Promise<VisibleProject[]> {
  let list = await projectsForUser(ctx.orgId, ctx.clerkUserId, ctx.role);
  if (list.length === 0 && ctx.user.email) {
    const claimed = await claimPendingInvitations(ctx.orgId, ctx.clerkUserId, ctx.user.email).catch(
      () => 0,
    );
    if (claimed > 0) list = await projectsForUser(ctx.orgId, ctx.clerkUserId, ctx.role);
  }
  return list;
}
