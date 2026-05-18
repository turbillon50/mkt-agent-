import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { createCampaign, listCampaigns } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const items = await listCampaigns(user.id);
  return NextResponse.json({ campaigns: items, activeCampaignId: user.activeCampaignId });
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const campaign = await createCampaign(user.id, {
    name,
    description: body?.description,
    brandName: body?.brandName ?? name,
    brandVoice: body?.brandVoice,
    brandTopics: body?.brandTopics,
    brandLanguage: body?.brandLanguage ?? 'es',
    audience: body?.audience,
    manifesto: body?.manifesto,
  });
  return NextResponse.json({ campaign });
}
