import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listLandings, createLanding } from '@/lib/campaign-landings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const landings = await listLandings(user.id);
    return NextResponse.json({ landings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const landing = await createLanding(user.id, {
      title: String(body.title ?? ''),
      subtitle: body.subtitle ?? null,
      description: body.description ?? null,
      ctaLabel: body.ctaLabel ?? null,
      campaignId: body.campaignId ?? null,
    });
    return NextResponse.json({ landing });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
