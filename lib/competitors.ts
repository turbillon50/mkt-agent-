import 'server-only';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { competitorLinks, type CompetitorLink, type NewCompetitorLink } from '@/src/db/schema';

function extractMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  }
  return null;
}

export async function addLink(
  userId: string,
  input: { label: string; url: string; kind: 'own' | 'competitor'; campaignId?: string | null }
): Promise<CompetitorLink> {
  const [row] = await db
    .insert(competitorLinks)
    .values({
      userId,
      campaignId: input.campaignId ?? null,
      label: input.label,
      url: input.url,
      kind: input.kind,
    } satisfies NewCompetitorLink)
    .returning();
  if (!row) throw new Error('No se pudo guardar el link.');
  return row;
}

export async function listLinks(userId: string): Promise<CompetitorLink[]> {
  return db
    .select()
    .from(competitorLinks)
    .where(eq(competitorLinks.userId, userId))
    .orderBy(desc(competitorLinks.createdAt));
}

export async function deleteLink(userId: string, id: string): Promise<void> {
  await db.delete(competitorLinks).where(and(eq(competitorLinks.userId, userId), eq(competitorLinks.id, id)));
}

export type LinkSnapshot = {
  id: string;
  label: string;
  url: string;
  kind: string;
  title: string | null;
  description: string | null;
  error: string | null;
};

export async function fetchSnapshot(link: CompetitorLink): Promise<LinkSnapshot> {
  try {
    const res = await fetch(link.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { id: link.id, label: link.label, url: link.url, kind: link.kind, title: null, description: null, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const title = extractMeta(html, 'og:title');
    const description = extractMeta(html, 'og:description');
    return { id: link.id, label: link.label, url: link.url, kind: link.kind, title, description, error: null };
  } catch (e) {
    return {
      id: link.id,
      label: link.label,
      url: link.url,
      kind: link.kind,
      title: null,
      description: null,
      error: e instanceof Error ? e.message : 'error',
    };
  }
}
