import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readUrl } from '../../jina';

export const readUrlTool = createTool({
  id: 'read-url',
  description:
    'Fetch any web URL through Jina Reader and get clean, readable markdown back. Use to analyze a competitor\'s site, read a product page Luis pasted, study a blog post, or research a news article. Strips ads, navigation, scripts — only the meat. Max ~20K chars per call.',
  inputSchema: z.object({
    url: z.string().url().describe('Full URL including https://'),
    maxChars: z.number().int().positive().max(40000).optional().describe('Truncate content to this many characters. Default 20000.'),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    bytes: z.number(),
  }),
  execute: async (input) => {
    return readUrl(input.url, { maxChars: input.maxChars });
  },
});
