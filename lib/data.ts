import 'server-only';
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { posts, planItems, knowledge } from '@/src/db/schema';

export async function getDashboardStats(orgId: string) {
  const [totalRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.orgId, orgId));
  const byPlatform = await db
    .select({ platform: posts.platform, c: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.orgId, orgId))
    .groupBy(posts.platform);
  const recent = await db
    .select()
    .from(posts)
    .where(eq(posts.orgId, orgId))
    .orderBy(desc(posts.createdAt))
    .limit(5);
  const [knowRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(knowledge)
    .where(eq(knowledge.orgId, orgId));
  const [planRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(planItems)
    .where(eq(planItems.orgId, orgId));

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${posts.createdAt}), 'YYYY-MM-DD')`.as('day'),
      c: sql<number>`count(*)::int`.as('c'),
    })
    .from(posts)
    .where(and(eq(posts.orgId, orgId), gte(posts.createdAt, since)))
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

/**
 * Lo publicado.
 *
 * `projectId` (corrida 6) acota al proyecto. Sin él, la sección Contenido del
 * cliente A le enseñaba lo publicado del cliente B de la misma agencia: los
 * dos comparten `org_id`. Se incluyen las publicaciones sin proyecto —las de
 * antes de la 0017— porque son de esa organización y esconderlas sería perder
 * el historial del cliente.
 */
export async function listPosts(
  orgId: string,
  platform?: 'twitter' | 'linkedin',
  projectId?: string,
) {
  const condiciones = [eq(posts.orgId, orgId)];
  if (platform) condiciones.push(eq(posts.platform, platform));
  if (projectId) {
    condiciones.push(or(eq(posts.projectId, projectId), isNull(posts.projectId))!);
  }
  return db
    .select()
    .from(posts)
    .where(and(...condiciones))
    .orderBy(desc(posts.createdAt))
    .limit(100);
}

export async function listPlanItems(orgId: string) {
  return db
    .select()
    .from(planItems)
    .where(eq(planItems.orgId, orgId))
    .orderBy(desc(planItems.createdAt), planItems.dayOffset)
    .limit(200);
}

export async function listKnowledge(orgId: string) {
  return db
    .select()
    .from(knowledge)
    .where(eq(knowledge.orgId, orgId))
    .orderBy(desc(knowledge.createdAt))
    .limit(100);
}
