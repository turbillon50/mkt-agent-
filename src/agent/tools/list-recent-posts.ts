import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { posts } from '../../db/schema.js';

export const listRecentPostsTool = createTool({
  id: 'list-recent-posts',
  description:
    'List the most recently published posts. Use to brief yourself on what we have already said before drafting new content.',
  inputSchema: z.object({
    platform: z.enum(['twitter', 'linkedin']).optional(),
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
    const query = input.platform
      ? db.select().from(posts).where(eq(posts.platform, input.platform)).orderBy(desc(posts.createdAt)).limit(limit)
      : db.select().from(posts).orderBy(desc(posts.createdAt)).limit(limit);
    const rows = await query;
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
