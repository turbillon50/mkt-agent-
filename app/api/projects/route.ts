import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { channelStatus, createProject, listProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, activeProjectId } = gate.ctx;

  const projects = await listProjects(orgId);
  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, channelStatus: channelStatus(p) })),
    activeProjectId: activeProjectId ?? projects[0]?.id ?? null,
    org: { id: orgId, name: gate.ctx.org.name, slug: gate.ctx.org.slug, role: gate.ctx.role },
  });
}

/** Alta de proyecto: el `org:member` opera leads, no crea ni configura. */
export async function POST(req: NextRequest) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const { orgId, user, clerkUserId } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });

  try {
    const project = await createProject(orgId, user.id, {
      name,
      kind: body?.kind,
      description: body?.description ?? null,
      sellerPersona: body?.sellerPersona ?? null,
      audience: body?.audience ?? null,
      channels: body?.channels,
      rules: body?.rules,
      mcpSources: body?.mcpSources,
    });

    // Primer proyecto de la org: queda activo para quien lo creó.
    const all = await listProjects(orgId);
    if (all.length === 1) {
      const { setActiveProject } = await import('@/src/sales/projects');
      await setActiveProject(orgId, clerkUserId, project.id);
    }
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
