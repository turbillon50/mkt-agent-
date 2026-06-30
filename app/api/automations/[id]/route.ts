import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updateFunnel, deleteFunnel } from '@/lib/automations';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    await updateFunnel(user.id, id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      triggerStatus: typeof body.triggerStatus === 'string' ? body.triggerStatus : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      steps: body.steps !== undefined ? body.steps : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteFunnel(user.id, id);
  return NextResponse.json({ ok: true });
}
