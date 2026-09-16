import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { createCampaign, listCampaigns } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const items = await listCampaigns(gate.ctx.orgId);
  return NextResponse.json({ campaigns: items, activeCampaignId: gate.ctx.activeProjectId });
}

export async function POST(req: NextRequest) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const campaign = await createCampaign(gate.ctx.orgId, gate.ctx.user.id, {
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
