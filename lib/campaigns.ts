import 'server-only';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { campaigns, users, type Campaign } from '@/src/db/schema';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'campana';
}

async function uniqueSlug(userId: string, base: string): Promise<string> {
  let slug = slugify(base);
  let i = 2;
  while (true) {
    const existing = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), eq(campaigns.slug, slug)))
      .limit(1);
    if (existing.length === 0) return slug;
    slug = `${slugify(base)}-${i++}`;
  }
}

export async function listCampaigns(userId: string): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(userId: string, id: string): Promise<Campaign | null> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampaign(userId: string, input: {
  name: string;
  description?: string;
  brandName?: string;
  brandVoice?: string;
  brandTopics?: string;
  brandLanguage?: string;
  audience?: string;
  manifesto?: string;
}): Promise<Campaign> {
  const slug = await uniqueSlug(userId, input.name);
  const [row] = await db
    .insert(campaigns)
    .values({
      userId,
      name: input.name,
      slug,
      description: input.description,
      brandName: input.brandName,
      brandVoice: input.brandVoice,
      brandTopics: input.brandTopics,
      brandLanguage: input.brandLanguage ?? 'es',
      audience: input.audience,
      manifesto: input.manifesto,
    })
    .returning();
  if (!row) throw new Error('Failed to create campaign.');

  // If this is the user's first campaign, mark it active.
  const all = await listCampaigns(userId);
  if (all.length === 1) {
    await setActiveCampaign(userId, row.id);
  }
  return row;
}

export async function updateCampaign(
  userId: string,
  id: string,
  patch: Partial<Pick<Campaign, 'name' | 'description' | 'brandName' | 'brandVoice' | 'brandTopics' | 'brandLanguage' | 'audience' | 'manifesto' | 'status'>>,
): Promise<Campaign | null> {
  const [row] = await db
    .update(campaigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(campaigns.userId, userId), eq(campaigns.id, id)))
    .returning();
  return row ?? null;
}

export async function setActiveCampaign(userId: string, campaignId: string | null): Promise<void> {
  await db
    .update(users)
    .set({ activeCampaignId: campaignId, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getActiveCampaign(userId: string): Promise<Campaign | null> {
  const u = await db.select({ activeCampaignId: users.activeCampaignId }).from(users).where(eq(users.id, userId)).limit(1);
  const id = u[0]?.activeCampaignId;
  if (!id) return null;
  return getCampaign(userId, id);
}

export async function archiveCampaign(userId: string, id: string): Promise<void> {
  await updateCampaign(userId, id, { status: 'archived' });
}
