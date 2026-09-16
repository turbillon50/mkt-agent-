import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { channelStatus, createProject, listProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const projects = await listProjects(user.id);
  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, channelStatus: channelStatus(p) })),
    activeProjectId: user.activeCampaignId,
  });
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });

  try {
    const project = await createProject(user.id, {
      name,
      kind: body?.kind,
      description: body?.description ?? null,
      sellerPersona: body?.sellerPersona ?? null,
      audience: body?.audience ?? null,
      channels: body?.channels,
      rules: body?.rules,
      mcpSources: body?.mcpSources,
    });
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
