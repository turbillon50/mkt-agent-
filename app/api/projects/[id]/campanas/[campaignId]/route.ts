import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';
import {
  CampaignError,
  campaignCounts,
  campaignLeads,
  deleteCampaign,
  getCampaign,
  toSummary,
  updateCampaign,
} from '@/src/marketing/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; campaignId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, campaignId } = await params;
  const gate = await apiProject(id, { section: 'campanas' });
  if (!gate.ok) return gate.res;

  const campana = await getCampaign(gate.ctx.orgId, id, campaignId);
  if (!campana) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [conteo, leads] = await Promise.all([
    campaignCounts(gate.ctx.orgId, id, campaignId),
    campaignLeads(gate.ctx.orgId, id, campaignId),
  ]);

  return NextResponse.json({
    campana: toSummary(campana, conteo),
    leads: leads.map((l) => ({
      id: l.id,
      nombre: l.fullName,
      telefono: l.phone,
      etapa: l.stage,
      grado: l.grade,
      puntaje: l.score,
      creado: l.createdAt.toISOString(),
    })),
    puedeEditar: gate.ctx.can('operar'),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, campaignId } = await params;
  const gate = await apiProject(id, { section: 'campanas', capability: 'operar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  try {
    const campana = await updateCampaign(orgId, id, campaignId, body);
    if (!campana) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await logProjectEvent({
      orgId,
      projectId: id,
      type: 'campaign_updated',
      actor: clerkUserId,
      actorEmail: user.email,
      payload: { campana: campana.id, nombre: campana.name, estado: campana.status },
    });
    return NextResponse.json({ campana: toSummary(campana) });
  } catch (e) {
    if (e instanceof CampaignError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'No se pudo guardar la campaña.' }, { status: 500 });
  }
}

/**
 * Borrar la campaña pide 'administrar', no 'operar': un editor puede pausarla,
 * pero tirar el histórico de por dónde entró la gente es del dueño.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, campaignId } = await params;
  const gate = await apiProject(id, { section: 'campanas', capability: 'administrar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const campana = await getCampaign(orgId, id, campaignId);
  if (!campana) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const borrada = await deleteCampaign(orgId, id, campaignId);
  if (!borrada) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'campaign_deleted',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { campana: campaignId, nombre: campana.name },
  });
  // Los leads que trajo NO se van con ella: la llave es ON DELETE SET NULL.
  return NextResponse.json({ ok: true });
}
