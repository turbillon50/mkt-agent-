import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { listProjectMembers, upsertProjectMember } from '@/src/projects/members';
import { logProjectEvent } from '@/src/projects/events';
import { isProjectRole, type ProjectRole } from '@/src/projects/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'equipo' });
  if (!gate.ok) return gate.res;

  const members = await listProjectMembers(gate.ctx.orgId, id);
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      esTuyo: m.clerkUserId === gate.ctx.clerkUserId,
    })),
    puedeAdministrar: gate.ctx.can('administrar'),
  });
}

/**
 * Invitar a alguien al proyecto.
 *
 * La invitación la manda CLERK, con `{ project_id, role }` en la metadata
 * pública. Goossip no manda su propio correo de invitación: serían dos verdades
 * sobre quién pertenece a la org, y tarde o temprano se contradicen.
 *
 * La fila local se crea igual y en estado `invitado`: es lo que hace que al
 * aceptar quede en ESTE proyecto y no en todos los de la organización.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'equipo', capability: 'administrar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user, project } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const role = body?.role as ProjectRole;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Escribe un correo válido.' }, { status: 400 });
  }
  if (!isProjectRole(role)) {
    return NextResponse.json({ error: 'Elige un rol.' }, { status: 400 });
  }

  let invitationId: string | null = null;
  let aviso: string | null = null;
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: email,
      inviterUserId: clerkUserId,
      role: 'org:member',
      publicMetadata: { project_id: id, project_role: role, project_name: project.name },
    });
    invitationId = invitation.id;
  } catch (e) {
    // Si el correo YA es miembro de la organización, Clerk se niega — y hace
    // bien. En ese caso no hay invitación que mandar: se le da acceso a este
    // proyecto y ya está adentro. Cualquier otro fallo sí se reporta.
    const detail = e instanceof Error ? e.message : 'error';
    if (!/already a member|already exists|duplicate/i.test(detail)) {
      return NextResponse.json({ error: `No se pudo invitar: ${detail}` }, { status: 400 });
    }
    aviso = 'Esa persona ya estaba en tu organización: le dimos acceso a este proyecto.';
  }

  const member = await upsertProjectMember({
    orgId,
    projectId: id,
    email,
    role,
    status: invitationId ? 'invitado' : 'activo',
    invitationId,
    invitedBy: clerkUserId,
  });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'member_invited',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { correo: email, rol: role },
  });

  return NextResponse.json({
    member: {
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      esTuyo: false,
    },
    aviso,
  });
}
