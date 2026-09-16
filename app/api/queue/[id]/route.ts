import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { ownedAction } from '@/lib/sales';
import { setStatus } from '@/src/sales/queue';
import { recordEvent } from '@/src/sales/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aprobar o rechazar una acción de la cola. Un tap, y queda con actor y hora. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const owned = await ownedAction(user.id, id);
  if (!owned) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const decision = String(body?.decision ?? '');
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision debe ser approve o reject' }, { status: 400 });
  }
  if (!['pending', 'approved', 'auto'].includes(owned.action.status)) {
    return NextResponse.json({ error: `la acción ya está ${owned.action.status}` }, { status: 409 });
  }

  const next = decision === 'approve' ? 'approved' : 'rejected';
  const action = await setStatus(id, next, {
    approvedBy: user.id,
    ...(decision === 'reject' ? { executedAt: new Date() } : {}),
  });

  if (owned.action.leadId) {
    await recordEvent({
      leadId: owned.action.leadId,
      type: 'note',
      actor: user.id,
      payload: { decision: next, kind: owned.action.kind, action_id: id },
    });
  }

  return NextResponse.json({ action });
}
