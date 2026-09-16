import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';
import { channelStatus, createProject } from '@/lib/projects';
import { connectedCounts } from '@/src/projects/connections';
import { memberCounts } from '@/src/projects/members';
import { setActiveProject } from '@/src/sales/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Los proyectos que ESTE usuario ve. No es "todos los de la org filtrados en el
 * cliente": lo que no le toca nunca sale de la base.
 */
export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, activeProjectId } = gate.ctx;

  const visible = await visibleProjects(gate.ctx);
  const ids = visible.map((v) => v.project.id);
  const [conectados, miembros] = await Promise.all([connectedCounts(ids), memberCounts(ids)]);

  return NextResponse.json({
    projects: visible.map(({ project, role, inherited }) => ({
      ...project,
      role,
      roleInherited: inherited,
      canales: conectados.get(project.id) ?? 0,
      miembros: miembros.get(project.id) ?? 0,
      channelStatus: channelStatus(project),
    })),
    activeProjectId: ids.includes(activeProjectId ?? '') ? activeProjectId : (ids[0] ?? null),
    org: { id: orgId, name: gate.ctx.org.name, slug: gate.ctx.org.slug, role: gate.ctx.role },
  });
}

/** Alta de proyecto: manda quien manda en la organización. */
export async function POST(req: NextRequest) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const { orgId, user, clerkUserId } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) {
    return NextResponse.json({ error: 'Ponle un nombre al proyecto.' }, { status: 400 });
  }

  try {
    const project = await createProject(
      orgId,
      user.id,
      {
        name,
        kind: body?.kind,
        description: body?.description ?? null,
        sellerPersona: body?.sellerPersona ?? null,
        audience: body?.audience ?? null,
        brandLanguage: body?.brandLanguage ?? 'es',
        website: body?.website ?? null,
        city: body?.city ?? null,
        country: body?.country ?? null,
        channels: body?.channels,
        rules: body?.rules,
        mcpSources: body?.mcpSources,
      },
      { clerkUserId, email: user.email },
    );

    // El proyecto recién creado queda activo para quien lo creó: acaba de
    // decir en qué quiere trabajar, no hay que preguntárselo otra vez.
    await setActiveProject(orgId, clerkUserId, project.id);

    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
