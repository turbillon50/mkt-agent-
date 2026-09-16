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

/**
 * Aquí VIVÍA un `createCampaign` que insertaba la fila del proyecto y nada más:
 * sin dueño en `project_members` y sin evento en la bitácora. Era un segundo
 * camino de alta que se fue separando del bueno (`createProject`), y en la base
 * quedó la prueba: el proyecto "goossip", creado el 16-sep a las 07:13 por esta
 * ruta, con **0 miembros y 0 eventos**.
 *
 * Se borró en la corrida 4 en vez de arreglarlo: dos funciones que dan de alta
 * lo mismo vuelven a separarse siempre. El único camino es `createProject`.
 */

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
