import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generatePost } from '../../generator.js';

export const generatePostTool = createTool({
  id: 'generate-post',
  description:
    'Draft a single social media post for a specific platform. Uses brand voice and semantic recall of prior posts to avoid repetition. Returns the post body only.',
  inputSchema: z.object({
    platform: z.enum(['twitter', 'linkedin']).describe('Target platform.'),
    topic: z.string().min(3).describe('Topic of the post, e.g. "ai automation for solo founders".'),
    angle: z.string().optional().describe('Optional angle, hook, or framing.'),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: async (input) => {
    const text = await generatePost({
      platform: input.platform,
      topic: input.topic,
      angle: input.angle,
    });
    return { text };
  },
});
