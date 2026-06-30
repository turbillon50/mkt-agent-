import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listPlans, createPlan } from '@/lib/memberships';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const plans = await listPlans(user.id);
    return NextResponse.json({ plans });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const plan = await createPlan(user.id, {
      name: String(body.name ?? ''),
      description: body.description ?? null,
      price: String(body.price ?? ''),
      currency: body.currency ?? 'MXN',
      interval: body.interval ?? 'mensual',
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      whatsappNumber: body.whatsappNumber ?? null,
    });
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
