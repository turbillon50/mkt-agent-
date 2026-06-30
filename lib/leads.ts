import 'server-only';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { leads, type Lead, type NewLead } from '@/src/db/schema';

function detectPlatform(url: string): string {
  if (/linkedin\.com/i.test(url)) return 'linkedin';
  if (/(twitter\.com|x\.com)/i.test(url)) return 'twitter';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com/i.test(url)) return 'facebook';
  return 'web';
}

function extractMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function enrichFromPublicPage(url: string): Promise<{
  fullName: string | null;
  headline: string | null;
  summary: string | null;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { fullName: null, headline: null, summary: null };
    const html = await res.text();

    const title = extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title');
    const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'twitter:description');

    // LinkedIn suele poner "Nombre - Cargo en Empresa | LinkedIn" en el title
    let fullName: string | null = null;
    let headline: string | null = null;
    if (title) {
      const cleaned = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
      const parts = cleaned.split(' - ');
      fullName = parts[0]?.trim() || null;
      headline = parts.slice(1).join(' - ').trim() || null;
    }

    return {
      fullName,
      headline,
      summary: description ? description.slice(0, 500) : null,
    };
  } catch {
    return { fullName: null, headline: null, summary: null };
  }
}

export async function createLead(
  userId: string,
  input: { sourceUrl: string; campaignId?: string | null }
): Promise<Lead> {
  const platform = detectPlatform(input.sourceUrl);
  const enriched = await enrichFromPublicPage(input.sourceUrl);

  const [row] = await db
    .insert(leads)
    .values({
      userId,
      campaignId: input.campaignId ?? null,
      sourceUrl: input.sourceUrl,
      platform,
      fullName: enriched.fullName,
      headline: enriched.headline,
      summary: enriched.summary,
    } satisfies NewLead)
    .onConflictDoUpdate({
      target: [leads.userId, leads.sourceUrl],
      set: {
        fullName: enriched.fullName,
        headline: enriched.headline,
        summary: enriched.summary,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el lead.');
  return row;
}

export async function listLeads(userId: string, campaignId?: string | null): Promise<Lead[]> {
  const where = campaignId
    ? and(eq(leads.userId, userId), eq(leads.campaignId, campaignId))
    : eq(leads.userId, userId);
  return db.select().from(leads).where(where).orderBy(desc(leads.createdAt));
}

export async function updateLeadStatus(
  userId: string,
  id: string,
  status: string
): Promise<void> {
  await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(leads.userId, userId), eq(leads.id, id)));
}

export async function deleteLead(userId: string, id: string): Promise<void> {
  await db.delete(leads).where(and(eq(leads.userId, userId), eq(leads.id, id)));
}
