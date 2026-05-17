import 'server-only';
import { desc, eq, sql, gte } from 'drizzle-orm';
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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${posts.createdAt}), 'YYYY-MM-DD')`.as('day'),
      c: sql<number>`count(*)::int`.as('c'),
    })
    .from(posts)
    .where(gte(posts.createdAt, since))
    .groupBy(sql`date_trunc('day', ${posts.createdAt})`)
    .orderBy(sql`date_trunc('day', ${posts.createdAt})`);

  const dailySeries: Array<{ day: string; c: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = daily.find((r) => r.day === key);
    dailySeries.push({ day: key, c: row?.c ?? 0 });
  }

  return {
    totalPosts: totalRow?.c ?? 0,
    byPlatform,
    recent,
    knowledgeCount: knowRow?.c ?? 0,
    planItems: planRow?.c ?? 0,
    dailySeries,
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
