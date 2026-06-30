import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updateOffer, deleteOffer, registerConversionBySlug, getOfferBySlug } from '@/lib/flash-offers';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    // Atajo: registrar una conversion manual desde el panel.
    if (body.action === 'convert' && typeof body.slug === 'string') {
      const offer = await getOfferBySlug(body.slug);
      if (!offer || offer.userId !== user.id) {
        return NextResponse.json({ error: 'no encontrada' }, { status: 404 });
      }
      await registerConversionBySlug(body.slug);
      return NextResponse.json({ ok: true });
    }
    await updateOffer(user.id, id, {
      name: body.name,
      description: body.description,
      price: body.price,
      currency: body.currency,
      destinationUrl: body.destinationUrl,
      active: typeof body.active === 'boolean' ? body.active : undefined,
      durationMinutes: body.durationMinutes != null ? Number(body.durationMinutes) : undefined,
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
  await deleteOffer(user.id, id);
  return NextResponse.json({ ok: true });
}
