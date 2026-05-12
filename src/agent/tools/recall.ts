import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { recall } from '../../memory/index.js';

export const recallTool = createTool({
  id: 'recall-memory',
  description:
    'Semantic search across stored memories (past posts, knowledge base, mentions). Use to avoid repetition or to ground a draft in prior context.',
  inputSchema: z.object({
    query: z.string().min(3),
    refType: z.enum(['post', 'knowledge', 'mention', 'reply']).optional(),
    k: z.number().int().positive().max(20).optional(),
  }),
  outputSchema: z.object({
    hits: z.array(
      z.object({
        refType: z.string(),
        refId: z.string(),
        content: z.string(),
        similarity: z.number(),
      }),
    ),
  }),
  execute: async (input) => {
    const hits = await recall(input.query, { k: input.k, refType: input.refType });
    return {
      hits: hits.map((h) => ({
        refType: h.refType,
        refId: h.refId,
        content: h.content,
        similarity: h.similarity,
      })),
    };
  },
});
