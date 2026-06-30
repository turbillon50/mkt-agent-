import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updatePlan, deletePlan } from '@/lib/memberships';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    await updatePlan(user.id, id, {
      name: body.name,
      description: body.description,
      price: body.price,
      currency: body.currency,
      interval: body.interval,
      benefits: Array.isArray(body.benefits) ? body.benefits : undefined,
      whatsappNumber: body.whatsappNumber,
      active: typeof body.active === 'boolean' ? body.active : undefined,
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
  await deletePlan(user.id, id);
  return NextResponse.json({ ok: true });
}
