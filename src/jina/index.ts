/**
 * Jina helpers — además de embeddings, exponemos Reader (URL → markdown
 * limpio) y Search (query → top resultados web con contenido). Ambos
 * comparten la misma API key.
 */
import { config } from '../config';

function key(): string {
  const k = config.embeddings.apiKey;
  if (!k) throw new Error('EMBEDDINGS_API_KEY (Jina) no está configurada.');
  return k;
}

export async function readUrl(url: string, opts: { maxChars?: number } = {}): Promise<{
  url: string;
  title: string | null;
  content: string;
  bytes: number;
}> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL debe empezar con http(s)://');
  }
  const endpoint = `https://r.jina.ai/${url}`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${key()}`,
      Accept: 'application/json',
      'X-With-Generated-Alt': 'true',
    },
    // 30s timeout via AbortController
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Jina Reader ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = await res.json() as {
    code?: number;
    data?: { title?: string; content?: string; url?: string };
  };
  const data = json?.data;
  if (!data) throw new Error('Jina Reader respondió sin data.');
  let content = data.content ?? '';
  const max = opts.maxChars ?? 20_000;
  if (content.length > max) {
    content = content.slice(0, max) + `\n\n…[truncado en ${max} chars]`;
  }
  return {
    url: data.url ?? url,
    title: data.title ?? null,
    content,
    bytes: content.length,
  };
}

export async function search(query: string, opts: { maxResults?: number; maxCharsPerResult?: number } = {}): Promise<{
  query: string;
  results: Array<{ url: string; title: string; snippet: string; content?: string }>;
}> {
  const q = encodeURIComponent(query);
  const endpoint = `https://s.jina.ai/${q}`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${key()}`,
      Accept: 'application/json',
      'X-Respond-With': 'no-content',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Jina Search ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = await res.json() as {
    data?: Array<{ url: string; title: string; description?: string; content?: string }>;
  };
  const data = json?.data ?? [];
  const max = opts.maxResults ?? 6;
  const maxChars = opts.maxCharsPerResult ?? 600;
  return {
    query,
    results: data.slice(0, max).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: (r.description ?? '').slice(0, maxChars),
      content: r.content?.slice(0, maxChars),
    })),
  };
}
