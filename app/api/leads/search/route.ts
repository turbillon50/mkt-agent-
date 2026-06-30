import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import {
  searchProspects,
  bulkCreateLeads,
  bulkCreateLeadsFromPlaces,
  type SearchFilters,
} from '@/lib/leads';
import { isMapsConfigured } from '@/lib/maps';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET() {
  return NextResponse.json({ mapsAvailable: isMapsConfigured() });
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? '').trim();
    if (!query) return NextResponse.json({ error: 'Escribe qué buscas' }, { status: 400 });

    const filters: SearchFilters = {
      minRating: typeof body.minRating === 'number' ? body.minRating : undefined,
      requirePhone: Boolean(body.requirePhone),
      requireWebsite: Boolean(body.requireWebsite),
      maxResults: typeof body.maxResults === 'number' ? Math.min(Math.max(body.maxResults, 1), 20) : undefined,
      aiPrompt: typeof body.aiPrompt === 'string' ? body.aiPrompt.trim() || undefined : undefined,
    };

    const candidates = await searchProspects(query, filters);
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
      source?: 'maps' | 'web' | 'linkedin';
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
