import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { getCampaign, updateCampaign, archiveCampaign } from '@/lib/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const campaign = await getCampaign(gate.ctx.orgId, id);
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const allowed = ['name', 'description', 'brandName', 'brandVoice', 'brandTopics', 'brandLanguage', 'audience', 'manifesto', 'status'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  const campaign = await updateCampaign(gate.ctx.orgId, id, patch as never);
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  await archiveCampaign(gate.ctx.orgId, id);
  return NextResponse.json({ ok: true });
}
