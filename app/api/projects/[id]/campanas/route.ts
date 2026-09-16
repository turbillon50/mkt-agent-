import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';
import {
  CampaignError,
  createCampaign,
  listCampaigns,
  toSummary,
} from '@/src/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Las campañas del proyecto.
 *
 * `section: 'campanas'` es el candado de verdad: un `conector` solo ve
 * Conexiones y aquí se topa con un 403, no con una lista vacía que lo deje
 * pensando que el cliente no pauta.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'campanas' });
  if (!gate.ok) return gate.res;

  const campanas = await listCampaigns(gate.ctx.orgId, id);
  return NextResponse.json({ campanas, puedeEditar: gate.ctx.can('operar') });
}

/** "Nueva campaña" vive SOLO aquí: dentro del proyecto, nunca en el menú. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'campanas', capability: 'operar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  try {
    const campana = await createCampaign(orgId, id, body, clerkUserId);
    await logProjectEvent({
      orgId,
      projectId: id,
      type: 'campaign_created',
      actor: clerkUserId,
      actorEmail: user.email,
      payload: { campana: campana.id, nombre: campana.name, objetivo: campana.objective },
    });
    return NextResponse.json({ campana: toSummary(campana) });
  } catch (e) {
    if (e instanceof CampaignError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'No se pudo crear la campaña.' }, { status: 500 });
  }
}
