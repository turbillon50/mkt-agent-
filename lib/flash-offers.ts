import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { flashOffers, type FlashOffer } from '@/src/db/schema';
import { appUrl, uniqueSlug } from './public-links';

// ── (3) Ofertas Flash ────────────────────────────────────────────────────
// El influencer crea una oferta con countdown y comparte un link publico
// (vliving.life/oferta/[slug]). El CTA pasa por /api/public/oferta/[slug]/go
// que cuenta el click y redirige al destino. Conversiones se cuentan cuando
// el destino hace ping al endpoint /converted (o manual desde el dashboard).

export function offerUrl(slug: string): string {
  return `${appUrl()}/oferta/${slug}`;
}

export function isLive(o: Pick<FlashOffer, 'active' | 'endsAt'>): boolean {
  return o.active && new Date(o.endsAt).getTime() > Date.now();
}

export async function listOffers(userId: string): Promise<FlashOffer[]> {
  return db.select().from(flashOffers).where(eq(flashOffers.userId, userId)).orderBy(desc(flashOffers.createdAt));
}

export async function getOfferBySlug(slug: string): Promise<FlashOffer | null> {
  const [row] = await db.select().from(flashOffers).where(eq(flashOffers.slug, slug)).limit(1);
  return row ?? null;
}

export type CreateOfferInput = {
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  destinationUrl: string;
  durationMinutes: number; // duracion desde ahora
};

export async function createOffer(userId: string, input: CreateOfferInput): Promise<FlashOffer> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('La oferta necesita un nombre.');
  const destinationUrl = normalizeUrl(input.destinationUrl);
  if (!destinationUrl) throw new Error('Pon un link de destino válido (https://...).');
  const minutes = Math.max(1, Math.floor(Number(input.durationMinutes) || 0));
  const endsAt = new Date(Date.now() + minutes * 60 * 1000);

  const [row] = await db
    .insert(flashOffers)
    .values({
      userId,
      slug: uniqueSlug(name),
      name,
      description: input.description?.trim() || null,
      price: input.price?.trim() || null,
      currency: (input.currency?.trim() || 'MXN').toUpperCase().slice(0, 8),
      destinationUrl,
      endsAt,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear la oferta.');
  return row;
}

export type UpdateOfferInput = Partial<{
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  destinationUrl: string;
  active: boolean;
  durationMinutes: number;
}>;

export async function updateOffer(userId: string, id: string, patch: UpdateOfferInput): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.price !== undefined) set.price = patch.price?.trim() || null;
  if (patch.currency != null) set.currency = patch.currency.trim().toUpperCase().slice(0, 8);
  if (patch.destinationUrl != null) {
    const url = normalizeUrl(patch.destinationUrl);
    if (url) set.destinationUrl = url;
  }
  if (patch.active != null) set.active = patch.active;
  if (patch.durationMinutes != null) {
    const minutes = Math.max(1, Math.floor(Number(patch.durationMinutes) || 0));
    set.endsAt = new Date(Date.now() + minutes * 60 * 1000);
  }
  await db.update(flashOffers).set(set).where(and(eq(flashOffers.userId, userId), eq(flashOffers.id, id)));
}

export async function deleteOffer(userId: string, id: string): Promise<void> {
  await db.delete(flashOffers).where(and(eq(flashOffers.userId, userId), eq(flashOffers.id, id)));
}

/** Cuenta un click y devuelve el destino para redirigir (o null si no existe). */
export async function registerClickBySlug(slug: string): Promise<string | null> {
  const [row] = await db
    .update(flashOffers)
    .set({ clickCount: sql`${flashOffers.clickCount} + 1` })
    .where(eq(flashOffers.slug, slug))
    .returning({ destinationUrl: flashOffers.destinationUrl });
  return row?.destinationUrl ?? null;
}

/** Cuenta una conversion (el destino hace ping, o manual desde el panel). */
export async function registerConversionBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .update(flashOffers)
    .set({ conversionCount: sql`${flashOffers.conversionCount} + 1` })
    .where(eq(flashOffers.slug, slug))
    .returning({ id: flashOffers.id });
  return rows.length > 0;
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
