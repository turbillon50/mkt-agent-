import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { addLink, listLinks, fetchSnapshot } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  try {
    const links = await listLinks(gate.ctx.orgId);
    const snapshots = await Promise.all(links.map((l) => fetchSnapshot(l)));
    return NextResponse.json({ links: snapshots });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  try {
    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? '').trim();
    const url = String(body.url ?? '').trim();
    const kind = body.kind === 'own' ? 'own' : 'competitor';
    if (!label || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Falta label o la URL no es válida' }, { status: 400 });
    }
    const link = await addLink(gate.ctx.orgId, gate.ctx.user.id, { label, url, kind, campaignId: gate.ctx.activeProjectId ?? null });
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
