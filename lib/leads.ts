import 'server-only';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { leads, type Lead, type NewLead } from '@/src/db/schema';
import { chat } from '@/src/openrouter';
import { isMapsConfigured, searchPlaces, type MapsPlace } from './maps';

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
      source: 'manual',
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
 * por el buscador de Google/grounding). Tolera fallos individuales sin
 * tronar el batch completo.
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

/**
 * Guarda candidatos de Google Maps directo (ya traen nombre/direccion/
 * telefono/sitio/rating reales — no hace falta re-enriquecer via fetch).
 */
export async function bulkCreateLeadsFromPlaces(
  userId: string,
  places: MapsPlace[],
  campaignId?: string | null,
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;
  for (const p of places.slice(0, 25)) {
    const sourceUrl = p.website || p.mapsUrl;
    if (!sourceUrl) {
      failed++;
      continue;
    }
    try {
      await db
        .insert(leads)
        .values({
          userId,
          campaignId: campaignId ?? null,
          sourceUrl,
          platform: 'web',
          source: 'maps',
          fullName: p.name,
          company: p.name,
          address: p.address,
          phone: p.phone,
          rating: p.rating,
          summary: [p.address, p.rating ? `${p.rating}★` : null].filter(Boolean).join(' · ') || null,
        } satisfies NewLead)
        .onConflictDoUpdate({
          target: [leads.userId, leads.sourceUrl],
          set: { address: p.address, phone: p.phone, rating: p.rating, updatedAt: new Date() },
        });
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

export type ProspectCandidate = {
  url: string;
  label: string;
  snippet: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: string | null;
  source: 'maps' | 'web';
};

/**
 * Buscador de prospectos REAL. Si GOOGLE_MAPS_API_KEY esta configurada usa
 * Places API (New) — datos estructurados reales (direccion, telefono,
 * rating), la opcion mas confiable. Si no, cae a Gemini + Google Search
 * grounding sobre EMPRESAS (no personas — se probo pedir perfiles
 * individuales de LinkedIn y el modelo INVENTABA URLs porque LinkedIn
 * bloquea esa indexacion; nunca se acepta nada sin fuente verificable).
 */
export async function searchProspects(query: string): Promise<ProspectCandidate[]> {
  if (isMapsConfigured()) {
    try {
      const places = await searchPlaces(query);
      if (places.length > 0) {
        return places
          .filter((p) => p.website || p.mapsUrl)
          .map((p) => ({
            url: (p.website || p.mapsUrl)!,
            label: p.name,
            snippet: [p.address, p.rating ? `${p.rating}★` : null].filter(Boolean).join(' · ') || null,
            address: p.address,
            phone: p.phone,
            rating: p.rating,
            source: 'maps' as const,
          }));
      }
    } catch {
      // si Maps falla, cae al fallback de grounding
    }
  }

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

  const seen = new Set<string>();
  const out: ProspectCandidate[] = [];
  for (const c of chunks) {
    const domain = c.web?.title?.trim();
    if (!domain || seen.has(domain)) continue;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) continue;
    seen.add(domain);
    out.push({ url: `https://${domain}`, label: domain, snippet: null, source: 'web' });
  }

  if (out.length === 0 && text) return [];
  return out.slice(0, 12);
}

// ============================================================
// Mensajes personalizados por prospecto. Cada uno se redacta por
// separado, con instrucciones explicitas de variar tono/estructura entre
// mensajes — mandar el mismo texto a 20 personas es justo el patron que
// hace que X/LinkedIn detecte spam y banee la cuenta.
// ============================================================

export async function generateOutreachMessages(
  userId: string,
  leadIds: string[],
  customPrompt: string | undefined,
  brand: { name: string; voice?: string | null } | null,
): Promise<Lead[]> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.userId, userId), inArray(leads.id, leadIds)));

  const updated: Lead[] = [];
  for (const lead of rows) {
    const context = [
      lead.fullName ? `Nombre/empresa: ${lead.fullName}` : null,
      lead.headline ? `Cargo/giro: ${lead.headline}` : null,
      lead.company && lead.company !== lead.fullName ? `Empresa: ${lead.company}` : null,
      lead.summary ? `Sobre ellos: ${lead.summary}` : null,
      lead.address ? `Ubicación: ${lead.address}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const sys = `Eres un asistente de prospección B2B en español mexicano. Escribes mensajes cortos de primer contacto (DM/email), naturales y específicos a cada prospecto — NUNCA genéricos ni con cara de plantilla. Cada mensaje debe sonar escrito por una persona distinta, variando saludo, estructura y tono — mandar el mismo patrón a muchos contactos hace que las redes detecten spam y bloqueen la cuenta. Máximo 3-4 líneas. Sin emojis excesivos, sin signos de exclamación de más.`;

    const userMsg = [
      brand ? `Quien escribe: ${brand.name}${brand.voice ? ` (tono: ${brand.voice})` : ''}.` : null,
      `Prospecto:\n${context || 'sin más datos, usa solo el nombre/empresa'}`,
      customPrompt ? `Instrucción extra del usuario: ${customPrompt}` : null,
      'Redacta el mensaje de primer contacto ahora. Solo el mensaje, sin explicación ni comillas.',
    ]
      .filter(Boolean)
      .join('\n\n');

    let message: string;
    try {
      message = await chat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ],
        { temperature: 1.0, maxTokens: 600 },
      );
    } catch (e) {
      message = '';
    }

    if (message) {
      const [row] = await db
        .update(leads)
        .set({ draftMessage: message.trim(), updatedAt: new Date() })
        .where(and(eq(leads.userId, userId), eq(leads.id, lead.id)))
        .returning();
      if (row) updated.push(row);
    } else {
      updated.push(lead);
    }
  }

  return updated;
}
