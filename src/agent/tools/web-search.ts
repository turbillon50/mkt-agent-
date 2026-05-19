import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { search } from '../../jina';

export const webSearchTool = createTool({
  id: 'web-search',
  description:
    'Search the web via Jina Search (Google-style results + clean content extracted). Use for: investigar tendencias del momento, encontrar competencia, validar un dato, traer ejemplos reales. Devuelve hasta 6 resultados con título, snippet y un poco de contenido cada uno. Si necesitas leer una URL específica con todo su contenido, usa read-url después.',
  inputSchema: z.object({
    query: z.string().min(2).describe('Lo que quieres buscar. Frase natural, no operadores raros.'),
    maxResults: z.number().int().min(1).max(10).optional().describe('Cuántos resultados (default 6).'),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string(),
      content: z.string().optional(),
    })),
  }),
  execute: async (input) => {
    return search(input.query, { maxResults: input.maxResults });
  },
});
