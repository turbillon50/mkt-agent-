import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import {
  searchProspects,
  searchLinkedInProspects,
  bulkCreateLeads,
  bulkCreateLeadsFromPlaces,
  bulkCreateLeadsFromLinkedIn,
} from '@/lib/leads';
import { isLinkedInSearchConfigured } from '@/lib/linkedin-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET() {
  return NextResponse.json({ linkedinAvailable: isLinkedInSearchConfigured() });
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? '').trim();
    const mode = body.mode === 'linkedin' ? 'linkedin' : 'business';
    if (!query) return NextResponse.json({ error: 'Escribe qué buscas' }, { status: 400 });

    const candidates = mode === 'linkedin' ? await searchLinkedInProspects(query) : await searchProspects(query);
    return NextResponse.json({ candidates, mode });
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
      snippet?: string | null;
      source?: 'maps' | 'web' | 'linkedin';
    }> = Array.isArray(body.candidates) ? body.candidates : [];

    if (candidates.length === 0) return NextResponse.json({ error: 'Sin resultados para agregar' }, { status: 400 });

    const mapsOnes = candidates.filter((c) => c.source === 'maps');
    const linkedinOnes = candidates.filter((c) => c.source === 'linkedin');
    const webOnes = candidates.filter((c) => c.source !== 'maps' && c.source !== 'linkedin');

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

    if (linkedinOnes.length > 0) {
      const result = await bulkCreateLeadsFromLinkedIn(
        user.id,
        linkedinOnes.map((c) => {
          const [headline, location] = (c.snippet ?? '').split(' · ');
          return { url: c.url, name: c.label ?? null, headline: headline || null, location: location || null };
        }),
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
