import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listOffers, createOffer } from '@/lib/flash-offers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const offers = await listOffers(user.id);
    return NextResponse.json({ offers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const offer = await createOffer(user.id, {
      name: String(body.name ?? ''),
      description: body.description ?? null,
      price: body.price ?? null,
      currency: body.currency ?? 'MXN',
      destinationUrl: String(body.destinationUrl ?? ''),
      durationMinutes: Number(body.durationMinutes ?? 60),
    });
    return NextResponse.json({ offer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
