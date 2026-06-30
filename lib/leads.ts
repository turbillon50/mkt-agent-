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

/**
 * Bulk version de createLead: agrega varias URLs de una sola pasada (usado
 * por el buscador). Tolera fallos individuales sin tronar el batch completo.
 */
export async function bulkCreateLeads(
  userId: string,
  urls: string[],
  campaignId?: string | null,
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;
  for (const url of urls.slice(0, 25)) {
    try {
      await createLead(userId, { sourceUrl: url, campaignId });
      created++;
    } catch {
      failed++;
    }
  }
  return { created, failed };
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

export type ProspectCandidate = { url: string; label: string; snippet: string | null };

/**
 * Buscador de prospectos REAL — usa Gemini con Google Search grounding.
 * IMPORTANTE: solo se aceptan resultados con fuente verificable
 * (groundingChunks reales). Se probo pedirle directamente "perfiles de
 * LinkedIn" y el modelo INVENTABA URLs creíbles sin fuente real (LinkedIn
 * bloquea la indexación de perfiles individuales) — por eso esta función
 * busca EMPRESAS/NEGOCIOS, no personas, que sí están bien indexados y
 * traen groundingChunks reales para verificar.
 */
export async function searchProspects(query: string): Promise<ProspectCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');

  const prompt = `Encuentra negocios o empresas reales relacionados con: "${query}". Dame nombre de la empresa y una breve descripción de cada una. Solo negocios reales y verificables, no inventes nada.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Búsqueda falló (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const chunks: Array<{ web?: { uri?: string; title?: string } }> = candidate?.groundingMetadata?.groundingChunks ?? [];
  const text: string = candidate?.content?.parts?.[0]?.text ?? '';

  // groundingChunks trae el dominio en "title" (ej. "mjmarketingmx.com") y
  // un link de redirect que expira rapido — NO lo persistimos, construimos
  // la URL directa al dominio real.
  const seen = new Set<string>();
  const out: ProspectCandidate[] = [];
  for (const c of chunks) {
    const domain = c.web?.title?.trim();
    if (!domain || seen.has(domain)) continue;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) continue; // descarta titulos que no son dominios
    seen.add(domain);
    out.push({ url: `https://${domain}`, label: domain, snippet: null });
  }

  if (out.length === 0 && text) {
    // Hubo busqueda pero sin chunks verificables -> no inventar nada, regresar vacio.
    return [];
  }

  return out.slice(0, 12);
}
