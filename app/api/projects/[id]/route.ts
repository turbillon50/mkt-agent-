import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { channelStatus, getProject, setActiveProject, updateProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const project = await getProject(gate.ctx.orgId, id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ project, channelStatus: channelStatus(project) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, canManage } = gate.ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const owned = await getProject(orgId, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // `activate` viaja en el mismo PATCH para que el formulario del panel guarde
  // y deje el proyecto seleccionado en un solo viaje. Cambiar de proyecto SÍ lo
  // puede hacer un `org:member`: es navegación, no configuración.
  if (body?.activate === true) {
    await setActiveProject(orgId, clerkUserId, id);
  }

  const wantsEdit = ['name', 'kind', 'description', 'sellerPersona', 'audience', 'channels', 'rules', 'mcpSources', 'status']
    .some((k) => k in body);
  if (!wantsEdit) return NextResponse.json({ project: owned, channelStatus: channelStatus(owned) });

  const manager = await apiOrgManager();
  if (!manager.ok) return manager.res;
  if (!canManage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const project = await updateProject(orgId, id, {
    name: body?.name,
    kind: body?.kind,
    description: body?.description,
    sellerPersona: body?.sellerPersona,
    audience: body?.audience,
    channels: body?.channels,
    rules: body?.rules,
    mcpSources: body?.mcpSources,
    status: body?.status,
  });
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ project, channelStatus: channelStatus(project) });
}
