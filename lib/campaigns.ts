import 'server-only';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { campaigns, type Campaign } from '@/src/db/schema';
// Un solo generador de slug para campañas y proyectos: son la misma tabla.
import { setActiveProject, uniqueSlug } from '@/src/sales/projects';
export { uniqueSlug };

export async function listCampaigns(orgId: string): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(orgId: string, id: string): Promise<Campaign | null> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampaign(
  orgId: string,
  userId: string,
  input: {
    name: string;
    description?: string;
    brandName?: string;
    brandVoice?: string;
    brandTopics?: string;
    brandLanguage?: string;
    audience?: string;
    manifesto?: string;
  },
): Promise<Campaign> {
  const slug = await uniqueSlug(orgId, input.name);
  const [row] = await db
    .insert(campaigns)
    .values({
      orgId,
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
  return row;
}

export async function updateCampaign(
  orgId: string,
  id: string,
  patch: Partial<Pick<Campaign, 'name' | 'description' | 'brandName' | 'brandVoice' | 'brandTopics' | 'brandLanguage' | 'audience' | 'manifesto' | 'status'>>,
): Promise<Campaign | null> {
  const [row] = await db
    .update(campaigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, id)))
    .returning();
  return row ?? null;
}

/** El proyecto activo vive en la membresía (user, org). Ver migración 0013. */
export async function setActiveCampaign(
  orgId: string,
  clerkUserId: string,
  campaignId: string | null,
): Promise<void> {
  await setActiveProject(orgId, clerkUserId, campaignId);
}

export async function archiveCampaign(orgId: string, id: string): Promise<void> {
  await updateCampaign(orgId, id, { status: 'archived' });
}
