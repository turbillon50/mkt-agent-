import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { getCampaign, setActiveCampaign } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId } = gate.ctx;
  const { id } = await params;
  const campaign = await getCampaign(orgId, id);
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await setActiveCampaign(orgId, clerkUserId, id);
  return NextResponse.json({ ok: true, activeCampaignId: id });
}
