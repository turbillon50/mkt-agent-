import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { posts, planItems, knowledge } from '@/src/db/schema';

export async function getDashboardStats() {
  const [totalRow] = await db.select({ c: sql<number>`count(*)::int` }).from(posts);
  const byPlatform = await db
    .select({ platform: posts.platform, c: sql<number>`count(*)::int` })
    .from(posts)
    .groupBy(posts.platform);
  const recent = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(5);
  const [knowRow] = await db.select({ c: sql<number>`count(*)::int` }).from(knowledge);
  const [planRow] = await db.select({ c: sql<number>`count(*)::int` }).from(planItems);
  return {
    totalPosts: totalRow?.c ?? 0,
    byPlatform,
    recent,
    knowledgeCount: knowRow?.c ?? 0,
    planItems: planRow?.c ?? 0,
  };
}

export async function listPosts(platform?: 'twitter' | 'linkedin') {
  return platform
    ? db.select().from(posts).where(eq(posts.platform, platform)).orderBy(desc(posts.createdAt)).limit(100)
    : db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100);
}

export async function listPlanItems() {
  return db
    .select()
    .from(planItems)
    .orderBy(desc(planItems.createdAt), planItems.dayOffset)
    .limit(200);
}

export async function listKnowledge() {
  return db.select().from(knowledge).orderBy(desc(knowledge.createdAt)).limit(100);
}
