import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { searchProspects, bulkCreateLeads } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? '').trim();
    if (!query) return NextResponse.json({ error: 'Escribe qué buscas' }, { status: 400 });
    const candidates = await searchProspects(query);
    return NextResponse.json({ candidates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === 'string') : [];
    if (urls.length === 0) return NextResponse.json({ error: 'Sin URLs para agregar' }, { status: 400 });
    const result = await bulkCreateLeads(user.id, urls, user.activeCampaignId ?? null);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
