import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { knowledge } from '../../db/schema.js';
import { remember } from '../../memory/index.js';

export const saveKnowledgeTool = createTool({
  id: 'save-knowledge',
  description:
    'Store a chunk of long-form content (brand guideline, FAQ, product spec) into the knowledge base + semantic memory so future drafts can recall it.',
  inputSchema: z.object({
    content: z.string().min(20),
    title: z.string().optional(),
    source: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async (input) => {
    const [row] = await db
      .insert(knowledge)
      .values({
        content: input.content,
        title: input.title ?? null,
        source: input.source ?? null,
      })
      .returning({ id: knowledge.id });

    if (!row) throw new Error('Failed to save knowledge.');

    await remember({
      refType: 'knowledge',
      refId: row.id,
      content: input.content,
      metadata: { title: input.title, source: input.source },
    });

    return { id: row.id };
  },
});
