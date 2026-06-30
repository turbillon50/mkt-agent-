import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { searchProspects, bulkCreateLeads, bulkCreateLeadsFromPlaces } from '@/lib/leads';

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
    const candidates: Array<{
      url: string;
      label?: string;
      address?: string | null;
      phone?: string | null;
      rating?: string | null;
      source?: 'maps' | 'web';
    }> = Array.isArray(body.candidates) ? body.candidates : [];

    if (candidates.length === 0) return NextResponse.json({ error: 'Sin resultados para agregar' }, { status: 400 });

    const mapsOnes = candidates.filter((c) => c.source === 'maps');
    const webOnes = candidates.filter((c) => c.source !== 'maps');

    let created = 0;
    let failed = 0;

    if (mapsOnes.length > 0) {
      const result = await bulkCreateLeadsFromPlaces(
        user.id,
        mapsOnes.map((c) => ({
          name: c.label ?? c.url,
          address: c.address ?? null,
          phone: c.phone ?? null,
          website: c.url,
          rating: c.rating ?? null,
          mapsUrl: c.url,
        })),
        user.activeCampaignId ?? null,
      );
      created += result.created;
      failed += result.failed;
    }

    if (webOnes.length > 0) {
      const result = await bulkCreateLeads(user.id, webOnes.map((c) => c.url), user.activeCampaignId ?? null);
      created += result.created;
      failed += result.failed;
    }

    return NextResponse.json({ created, failed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
