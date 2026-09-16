import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { getProject } from '@/lib/projects';
import { activeProject, pipeline } from '@/lib/sales';
import { ingestLead } from '@/src/sales/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, activeProjectId } = gate.ctx;

  const wanted = req.nextUrl.searchParams.get('projectId');
  const project = wanted ? await getProject(orgId, wanted) : await activeProject(orgId, activeProjectId);
  if (!project) return NextResponse.json({ leads: [], project: null });

  const leads = await pipeline(orgId, project.id);
  return NextResponse.json({
    project: { id: project.id, name: project.name, slug: project.slug, kind: project.kind },
    leads,
  });
}

/** Alta manual de un lead de venta desde el panel. */
export async function POST(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, activeProjectId, user } = gate.ctx;
  const body = await req.json().catch(() => ({}));

  const project = body?.projectId
    ? await getProject(orgId, body.projectId)
    : await activeProject(orgId, activeProjectId);
  if (!project) return NextResponse.json({ error: 'Primero crea un proyecto.' }, { status: 400 });

  const phone = String(body?.phone ?? '').trim();
  const fullName = String(body?.fullName ?? '').trim();
  if (!phone && !body?.email) {
    return NextResponse.json({ error: 'Hace falta teléfono o correo.' }, { status: 400 });
  }

  try {
    const result = await ingestLead({
      project,
      fullName: fullName || null,
      phone: phone || null,
      email: String(body?.email ?? '').trim() || null,
      source: 'manual',
      sourceRef: null,
      createdAt: new Date(),
      raw: { alta: 'manual', por: user.email },
    });
    return NextResponse.json({
      lead: result.lead,
      created: result.created,
      enqueued: result.enqueued,
      lookup: result.lookup,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
