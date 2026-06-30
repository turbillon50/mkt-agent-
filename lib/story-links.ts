import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { storyLinks, linkClicks, type StoryLink, type StoryRule, type LinkClick } from '@/src/db/schema';
import { appUrl, uniqueSlug } from './public-links';

// ── (6) Story Link inteligente ───────────────────────────────────────────
// Un link maestro (vliving.life/go/[slug]) que redirige a destinos distintos
// segun los query params del visitante (utm_source, utm_campaign, etc). Cada
// regla {param,value,url} se evalua en orden; la primera que matchea gana.
// Si ninguna matchea, cae al defaultUrl. Cada click se cuenta y se loguea.

/** URL publica del story link. */
export function goUrl(slug: string): string {
  return `${appUrl()}/go/${slug}`;
}

export async function listStoryLinks(userId: string): Promise<StoryLink[]> {
  return db.select().from(storyLinks).where(eq(storyLinks.userId, userId)).orderBy(desc(storyLinks.createdAt));
}

export async function getStoryLinkBySlug(slug: string): Promise<StoryLink | null> {
  const [row] = await db.select().from(storyLinks).where(eq(storyLinks.slug, slug)).limit(1);
  return row ?? null;
}

export type CreateStoryLinkInput = {
  name: string;
  defaultUrl: string;
  rules?: StoryRule[];
};

export async function createStoryLink(userId: string, input: CreateStoryLinkInput): Promise<StoryLink> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('El story link necesita un nombre.');
  const defaultUrl = normalizeUrl(input.defaultUrl);
  if (!defaultUrl) throw new Error('Pon un link de destino por defecto válido (https://...).');
  const rules = normalizeRules(input.rules);

  const [row] = await db
    .insert(storyLinks)
    .values({
      userId,
      slug: uniqueSlug(name),
      name,
      defaultUrl,
      rules,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear el story link.');
  return row;
}

export type UpdateStoryLinkInput = Partial<{
  name: string;
  defaultUrl: string;
  rules: StoryRule[];
  active: boolean;
}>;

export async function updateStoryLink(userId: string, id: string, patch: UpdateStoryLinkInput): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (name) set.name = name;
  }
  if (patch.defaultUrl != null) {
    const url = normalizeUrl(patch.defaultUrl);
    if (url) set.defaultUrl = url;
  }
  if (patch.rules != null) set.rules = normalizeRules(patch.rules);
  if (patch.active != null) set.active = patch.active;
  await db.update(storyLinks).set(set).where(and(eq(storyLinks.userId, userId), eq(storyLinks.id, id)));
}

export async function deleteStoryLink(userId: string, id: string): Promise<void> {
  await db.delete(storyLinks).where(and(eq(storyLinks.userId, userId), eq(storyLinks.id, id)));
}

export type ResolveInput = {
  params: Record<string, string>;
  referrer?: string | null;
};

/**
 * Resuelve el destino de un slug segun las reglas + query params, cuenta el
 * click y registra una fila en linkClicks. Devuelve {url} o null si el link
 * no existe o esta inactivo.
 */
export async function resolveAndLog(slug: string, input: ResolveInput): Promise<{ url: string } | null> {
  const link = await getStoryLinkBySlug(slug);
  if (!link || !link.active) return null;

  const params = input.params ?? {};
  const matchedUrl = matchUrl(link, params);

  try {
    await db
      .update(storyLinks)
      .set({ clickCount: sql`${storyLinks.clickCount} + 1` })
      .where(eq(storyLinks.id, link.id));
    await db.insert(linkClicks).values({
      storyLinkId: link.id,
      matchedUrl,
      utmSource: pickParam(params, 'utm_source'),
      utmCampaign: pickParam(params, 'utm_campaign'),
      referrer: input.referrer ?? null,
    });
  } catch {
    /* el conteo/log no debe romper el redirect */
  }

  return { url: matchedUrl };
}

/** Ultimos clicks de un story link (para el panel de detalle). */
export async function recentClicks(userId: string, storyLinkId: string, limit = 20): Promise<LinkClick[]> {
  // garantizar que el link pertenece al usuario antes de exponer sus clicks
  const [owned] = await db
    .select({ id: storyLinks.id })
    .from(storyLinks)
    .where(and(eq(storyLinks.userId, userId), eq(storyLinks.id, storyLinkId)))
    .limit(1);
  if (!owned) return [];
  return db
    .select()
    .from(linkClicks)
    .where(eq(linkClicks.storyLinkId, storyLinkId))
    .orderBy(desc(linkClicks.createdAt))
    .limit(limit);
}

// ── helpers internos ─────────────────────────────────────────────────────

/** Aplica las reglas en orden contra los query params (case-insensitive). */
function matchUrl(link: StoryLink, params: Record<string, string>): string {
  for (const rule of link.rules ?? []) {
    if (!rule || !rule.param) continue;
    const value = pickParam(params, rule.param);
    if (value != null && value.toLowerCase() === String(rule.value ?? '').toLowerCase()) {
      return rule.url;
    }
  }
  return link.defaultUrl;
}

/** Lee un query param de forma case-insensitive. */
function pickParam(params: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(params)) {
    if (key.toLowerCase() === target) return val;
  }
  return null;
}

/** Normaliza/valida una lista de reglas; descarta las invalidas. */
function normalizeRules(rules: StoryRule[] | undefined): StoryRule[] {
  if (!Array.isArray(rules)) return [];
  const out: StoryRule[] = [];
  for (const r of rules) {
    const param = (r?.param ?? '').trim();
    const value = (r?.value ?? '').trim();
    const url = normalizeUrl(r?.url);
    if (param && value && url) out.push({ param, value, url });
  }
  return out;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
