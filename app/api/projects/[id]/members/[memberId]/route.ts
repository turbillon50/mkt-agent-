import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';
import {
  getProjectMember,
  listProjectMembers,
  removeProjectMember,
  setProjectMemberRole,
} from '@/src/projects/members';
import { isProjectRole, type ProjectRole } from '@/src/projects/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cambiar el rol de alguien dentro del proyecto. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;
  const gate = await apiProject(id, { section: 'equipo', capability: 'administrar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const role = body?.role as ProjectRole;
  if (!isProjectRole(role)) return NextResponse.json({ error: 'Elige un rol.' }, { status: 400 });

  const actual = await getProjectMember(orgId, id, memberId);
  if (!actual) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const problema = await dejaríaAlProyectoSinDueño(orgId, id, actual.id, role);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const member = await setProjectMemberRole(orgId, id, memberId, role);
  if (!member) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'member_role_changed',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { correo: member.email, de: actual.role, a: role },
  });

  return NextResponse.json({
    member: {
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      esTuyo: member.clerkUserId === clerkUserId,
    },
  });
}

/** Sacar a alguien del proyecto. Sigue en la organización: esto es el proyecto. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await params;
  const gate = await apiProject(id, { section: 'equipo', capability: 'administrar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const actual = await getProjectMember(orgId, id, memberId);
  if (!actual) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const problema = await dejaríaAlProyectoSinDueño(orgId, id, actual.id, null);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  /**
   * PRIMERO Clerk, después la fila.
   *
   * La QA del 16-sep midió esto: el DELETE contestaba `ok:true`, la fila se
   * borraba y la invitación de Clerk se quedaba **`pending`**. Quien tuviera ese
   * correo podía seguir entrando a la organización. El `invitationId` lo guarda
   * el POST desde la corrida 4 y este handler ni lo miraba.
   *
   * El orden importa: si se borrara la fila primero y Clerk fallara, se perdería
   * el `invitationId` y ya no habría forma de revocar nada desde la app. Así, un
   * fallo de Clerk deja todo como estaba y se dice por qué.
   */
  let revocada: boolean | null = null;
  if (actual.status === 'invitado' && actual.invitationId) {
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      await client.organizations.revokeOrganizationInvitation({
        organizationId: orgId,
        invitationId: actual.invitationId,
        requestingUserId: clerkUserId,
      });
      revocada = true;
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'error';
      // Que ya esté revocada o aceptada no es un fallo: el trabajo está hecho.
      if (/already|not found|revoked|accepted/i.test(detalle)) {
        revocada = true;
      } else {
        return NextResponse.json(
          {
            error: `No pudimos cancelar la invitación de ${actual.email ?? 'esa persona'}. No la sacamos del proyecto para no dejarle el acceso abierto. Inténtalo otra vez.`,
          },
          { status: 502 },
        );
      }
    }
  }

  const member = await removeProjectMember(orgId, id, memberId);
  if (!member) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'member_removed',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { correo: member.email, rol: member.role, invitacion_revocada: revocada },
  });

  return NextResponse.json({ ok: true, invitacionRevocada: revocada });
}

/**
 * Un proyecto no se queda sin dueño.
 *
 * `nuevoRol = null` significa "lo van a borrar". Devuelve el mensaje de error o
 * null si no hay problema.
 */
async function dejaríaAlProyectoSinDueño(
  orgId: string,
  projectId: string,
  memberId: string,
  nuevoRol: ProjectRole | null,
): Promise<string | null> {
  if (nuevoRol === 'dueño') return null;
  const todos = await listProjectMembers(orgId, projectId);
  const dueños = todos.filter((m) => m.role === 'dueño' && m.id !== memberId);
  if (dueños.length > 0) return null;
  const esElÚltimo = todos.some((m) => m.id === memberId && m.role === 'dueño');
  if (!esElÚltimo) return null;
  return 'Este proyecto se quedaría sin dueño. Nombra a otro dueño antes.';
}
