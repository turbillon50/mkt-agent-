import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { getCampaign, updateCampaign, deleteCampaign, campaignAnalytics } from '@/lib/mailing';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const campaign = await getCampaign(user.id, id);
    if (!campaign) return NextResponse.json({ error: 'no encontrada' }, { status: 404 });
    const analytics = await campaignAnalytics(user.id, id);
    return NextResponse.json({ campaign, analytics });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    await updateCampaign(user.id, id, {
      name: body.name,
      subject: body.subject,
      body: body.body,
      segment: body.segment,
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
  try {
    await deleteCampaign(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
