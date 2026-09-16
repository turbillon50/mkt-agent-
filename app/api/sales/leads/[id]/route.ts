import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { leadTimeline, ownedLead } from '@/lib/sales';
import { moveStage, recordEvent } from '@/src/sales/repo';
import { LEAD_STAGES, type LeadStage } from '@/src/sales/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId } = gate.ctx;
  const { id } = await params;
  const owned = await ownedLead(orgId, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const timeline = await leadTimeline(orgId, id);
  return NextResponse.json({ lead: owned.lead, ...timeline });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, user } = gate.ctx;
  const { id } = await params;
  const owned = await ownedLead(orgId, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  let lead = owned.lead;

  if (typeof body?.stage === 'string') {
    if (!LEAD_STAGES.includes(body.stage as LeadStage)) {
      return NextResponse.json({ error: 'etapa inválida' }, { status: 400 });
    }
    // `force`: el humano manda. Puede regresar un lead que se adelantó.
    lead = (await moveStage(id, body.stage as LeadStage, user.id, { force: true })) ?? lead;
  }

  if (typeof body?.note === 'string' && body.note.trim()) {
    await recordEvent({
      orgId,
      leadId: id,
      type: 'note',
      actor: user.id,
      payload: { note: body.note.trim().slice(0, 2000) },
    });
  }

  if (body?.logCall === true) {
    await recordEvent({ orgId, leadId: id, type: 'call', actor: user.id, payload: { por: user.email } });
  }

  return NextResponse.json({ lead });
}
