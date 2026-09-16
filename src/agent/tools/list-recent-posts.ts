import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { posts } from '../../db/schema';
import { systemOrgId } from '../../orgs/system';

export const listRecentPostsTool = createTool({
  id: 'list-recent-posts',
  description:
    'List the most recently published posts. Use to brief yourself on what we have already said before drafting new content.',
  inputSchema: z.object({
    platform: z.enum(['twitter', 'linkedin', 'meta', 'instagram']).optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  outputSchema: z.object({
    posts: z.array(
      z.object({
        id: z.string(),
        platform: z.string(),
        topic: z.string().nullable(),
        text: z.string(),
        publishedAt: z.string().nullable(),
        externalUrl: z.string().nullable(),
      }),
    ),
  }),
  execute: async (input) => {
    const limit = input.limit ?? 10;
    const orgId = await systemOrgId();
    const where = input.platform
      ? and(eq(posts.orgId, orgId), eq(posts.platform, input.platform))
      : eq(posts.orgId, orgId);
    const rows = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(limit);
    return {
      posts: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        topic: r.topic,
        text: r.text,
        publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
        externalUrl: r.externalUrl,
      })),
    };
  },
});
