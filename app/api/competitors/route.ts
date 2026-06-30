import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { addLink, listLinks, fetchSnapshot } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const links = await listLinks(user.id);
    const snapshots = await Promise.all(links.map((l) => fetchSnapshot(l)));
    return NextResponse.json({ links: snapshots });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? '').trim();
    const url = String(body.url ?? '').trim();
    const kind = body.kind === 'own' ? 'own' : 'competitor';
    if (!label || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Falta label o la URL no es válida' }, { status: 400 });
    }
    const link = await addLink(user.id, { label, url, kind, campaignId: user.activeCampaignId ?? null });
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
