import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { channelStatus, getProject, updateProject } from '@/lib/projects';
import { setActiveCampaign } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ project, channelStatus: channelStatus(project) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // `activate` viaja en el mismo PATCH para que el formulario del panel guarde
  // y deje el proyecto seleccionado en un solo viaje.
  if (body?.activate === true) {
    const owned = await getProject(user.id, id);
    if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await setActiveCampaign(user.id, id);
  }

  const project = await updateProject(user.id, id, {
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
