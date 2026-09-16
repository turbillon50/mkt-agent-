import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { channelStatus, setActiveProject, updateProject } from '@/lib/projects';
import { logProjectEvent } from '@/src/projects/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id);
  if (!gate.ok) return gate.res;
  const { project, projectRole } = gate.ctx;
  return NextResponse.json({ project, role: projectRole, channelStatus: channelStatus(project) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const EDITABLES = [
    'name',
    'kind',
    'description',
    'sellerPersona',
    'audience',
    'website',
    'city',
    'country',
    'channels',
    'rules',
    'mcpSources',
    'status',
  ] as const;
  const wantsEdit = EDITABLES.some((k) => k in body);

  // Cambiar de proyecto es NAVEGACIÓN, no configuración: lo puede hacer
  // cualquiera que tenga acceso al proyecto, incluido un lector. Editarlo pide
  // rol de administrar.
  const gate = await apiProject(id, wantsEdit ? { capability: 'administrar' } : {});
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, project, projectRole, user } = gate.ctx;

  if (body?.activate === true) {
    await setActiveProject(orgId, clerkUserId, id);
  }

  if (!wantsEdit) {
    return NextResponse.json({ project, role: projectRole, channelStatus: channelStatus(project) });
  }

  const updated = await updateProject(orgId, id, {
    name: body?.name,
    kind: body?.kind,
    description: body?.description,
    sellerPersona: body?.sellerPersona,
    audience: body?.audience,
    website: body?.website,
    city: body?.city,
    country: body?.country,
    channels: body?.channels,
    rules: body?.rules,
    mcpSources: body?.mcpSources,
    status: body?.status,
  });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'project_updated',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { campos: EDITABLES.filter((k) => k in body) },
  });

  return NextResponse.json({
    project: updated,
    role: projectRole,
    channelStatus: channelStatus(updated),
  });
}
