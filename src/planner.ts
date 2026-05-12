import { and, eq, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './db/client.js';
import { planItems, type PlanItem } from './db/schema.js';
import { generateWeeklyPlan } from './generator.js';
import { enabledPosters } from './posters/index.js';
import type { Platform } from './config.js';

export async function buildPlan(): Promise<{ planId: string; items: PlanItem[] }> {
  const platforms = enabledPosters().map((p) => p.platform);
  if (platforms.length === 0) {
    throw new Error('No platforms enabled. Set TWITTER_ENABLED or LINKEDIN_ENABLED in .env');
  }
  const drafts = await generateWeeklyPlan({ platforms });
  const planId = randomUUID();
  const rows = await db.insert(planItems).values(
    drafts.map((d) => ({
      planId,
      dayOffset: d.dayOffset,
      platform: d.platform,
      topic: d.topic,
      angle: d.angle ?? null,
    })),
  ).returning();
  return { planId, items: rows };
}

export async function nextUnusedItem(platform: Platform): Promise<PlanItem | null> {
  const rows = await db.select().from(planItems)
    .where(and(eq(planItems.platform, platform), eq(planItems.used, false)))
    .orderBy(asc(planItems.dayOffset))
    .limit(1);
  return rows[0] ?? null;
}

export async function markUsed(itemId: string): Promise<void> {
  await db.update(planItems).set({ used: true }).where(eq(planItems.id, itemId));
}

export async function latestPlan(): Promise<PlanItem[]> {
  return db.select().from(planItems).orderBy(asc(planItems.createdAt), asc(planItems.dayOffset));
}
