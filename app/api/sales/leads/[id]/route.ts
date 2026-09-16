import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { leadTimeline, ownedLead } from '@/lib/sales';
import { moveStage, recordEvent } from '@/src/sales/repo';
import { LEAD_STAGES, type LeadStage } from '@/src/sales/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const owned = await ownedLead(user, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const timeline = await leadTimeline(id);
  return NextResponse.json({ lead: owned.lead, ...timeline });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const owned = await ownedLead(user, id);
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
      leadId: id,
      type: 'note',
      actor: user.id,
      payload: { note: body.note.trim().slice(0, 2000) },
    });
  }

  if (body?.logCall === true) {
    await recordEvent({ leadId: id, type: 'call', actor: user.id, payload: { por: user.email } });
  }

  return NextResponse.json({ lead });
}
