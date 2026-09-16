import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { createLead, listLeads } from '@/lib/leads';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  try {
    const items = await listLeads(gate.ctx.orgId, gate.ctx.activeProjectId ?? undefined);
    return NextResponse.json({ leads: items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  try {
    const body = await req.json().catch(() => ({}));
    const sourceUrl = String(body.sourceUrl ?? '').trim();
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }
    const lead = await createLead(gate.ctx.orgId, gate.ctx.user.id, {
      sourceUrl,
      campaignId: gate.ctx.activeProjectId ?? null,
    });
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
