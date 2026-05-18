import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { getCampaign, setActiveCampaign } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const campaign = await getCampaign(user.id, id);
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await setActiveCampaign(user.id, id);
  return NextResponse.json({ ok: true, activeCampaignId: id });
}
