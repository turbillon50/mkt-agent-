import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { campaignLandings, type CampaignLanding } from '@/src/db/schema';
import { appUrl, uniqueSlug } from './public-links';

// ── (8) Pagina de ventas por campana ─────────────────────────────────────
// El influencer crea una landing por campana con un link publico
// (vliving.life/c/[slug]). La pagina muestra el pitch y un formulario de
// captura; cada submit crea un lead (capturePublicLead) y suma submissions.
// Las vistas se cuentan al renderizar la pagina publica.

export function landingUrl(slug: string): string {
  return `${appUrl()}/c/${slug}`;
}

export async function listLandings(userId: string): Promise<CampaignLanding[]> {
  return db
    .select()
    .from(campaignLandings)
    .where(eq(campaignLandings.userId, userId))
    .orderBy(desc(campaignLandings.createdAt));
}

export async function getLandingBySlug(slug: string): Promise<CampaignLanding | null> {
  const [row] = await db.select().from(campaignLandings).where(eq(campaignLandings.slug, slug)).limit(1);
  return row ?? null;
}

export type CreateLandingInput = {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  campaignId?: string | null;
};

export async function createLanding(userId: string, input: CreateLandingInput): Promise<CampaignLanding> {
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('La página necesita un título.');

  const [row] = await db
    .insert(campaignLandings)
    .values({
      userId,
      campaignId: input.campaignId?.trim() || null,
      slug: uniqueSlug(title),
      title,
      subtitle: input.subtitle?.trim() || null,
      description: input.description?.trim() || null,
      ctaLabel: input.ctaLabel?.trim() || 'Quiero más información',
    })
    .returning();
  if (!row) throw new Error('No se pudo crear la página.');
  return row;
}

export type UpdateLandingInput = Partial<{
  title: string;
  subtitle: string | null;
  description: string | null;
  ctaLabel: string;
  campaignId: string | null;
  published: boolean;
}>;

export async function updateLanding(userId: string, id: string, patch: UpdateLandingInput): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title != null) set.title = patch.title.trim();
  if (patch.subtitle !== undefined) set.subtitle = patch.subtitle?.trim() || null;
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.ctaLabel != null) set.ctaLabel = patch.ctaLabel.trim() || 'Quiero más información';
  if (patch.campaignId !== undefined) set.campaignId = patch.campaignId?.trim() || null;
  if (patch.published != null) set.published = patch.published;
  await db
    .update(campaignLandings)
    .set(set)
    .where(and(eq(campaignLandings.userId, userId), eq(campaignLandings.id, id)));
}

export async function deleteLanding(userId: string, id: string): Promise<void> {
  await db.delete(campaignLandings).where(and(eq(campaignLandings.userId, userId), eq(campaignLandings.id, id)));
}

/** Cuenta una vista de la pagina publica. */
export async function registerView(slug: string): Promise<void> {
  await db
    .update(campaignLandings)
    .set({ views: sql`${campaignLandings.views} + 1` })
    .where(eq(campaignLandings.slug, slug));
}

/** Cuenta un envio del formulario de captura. */
export async function registerSubmission(slug: string): Promise<void> {
  await db
    .update(campaignLandings)
    .set({ submissions: sql`${campaignLandings.submissions} + 1` })
    .where(eq(campaignLandings.slug, slug));
}
