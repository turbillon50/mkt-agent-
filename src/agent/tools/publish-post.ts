import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getPoster } from '../../posters/index.js';
import { db } from '../../db/client.js';
import { posts } from '../../db/schema.js';
import { remember } from '../../memory/index.js';

export const publishPostTool = createTool({
  id: 'publish-post',
  description:
    'Publish a finished post to the given platform and persist it to the database + semantic memory. Use ONLY after the user (or another tool) has approved final text.',
  inputSchema: z.object({
    platform: z.enum(['twitter', 'linkedin']),
    text: z.string().min(1),
    topic: z.string().optional(),
    angle: z.string().optional(),
  }),
  outputSchema: z.object({
    externalId: z.string().optional(),
    externalUrl: z.string().optional(),
    postId: z.string(),
  }),
  execute: async (input) => {
    const poster = getPoster(input.platform);
    const out = await poster.post(input.text);

    const [row] = await db
      .insert(posts)
      .values({
        platform: input.platform,
        text: input.text,
        topic: input.topic ?? null,
        angle: input.angle ?? null,
        externalId: out.id,
        externalUrl: out.url,
        publishedAt: new Date(),
      })
      .returning({ id: posts.id });

    if (!row) throw new Error('Failed to persist post.');

    await remember({
      refType: 'post',
      refId: row.id,
      content: `${input.topic ?? 'untitled'} | ${input.text}`,
      metadata: { platform: input.platform, topic: input.topic },
    }).catch(() => undefined);

    return { externalId: out.id, externalUrl: out.url, postId: row.id };
  },
});
