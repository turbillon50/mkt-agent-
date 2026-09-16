/**
 * Cliente MCP mínimo sobre HTTP (JSON-RPC 2.0, transporte streamable).
 *
 * Sirve para una sola cosa: que el vendedor pueda consultar el catálogo y los
 * precios REALES del cliente antes de contestar. Si la fuente no responde, no
 * se inventa nada: se devuelve vacío y el vendedor dice que lo confirma un
 * asesor. Por eso ninguna función de aquí lanza.
 */
import type { McpSource } from './types';

const TIMEOUT_MS = 8_000;
const CLIENT_INFO = { name: 'goossip-seller', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

interface RpcResult {
  result?: any;
  error?: { message?: string };
}

async function rpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  sessionId: string | null,
): Promise<{ data: RpcResult | null; sessionId: string | null }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const nextSession = res.headers.get('mcp-session-id') ?? sessionId;
    if (!res.ok) return { data: null, sessionId: nextSession };

    const text = await res.text();
    // Transporte streamable: la respuesta puede venir como SSE (`data: {...}`).
    const line = text.includes('data:')
      ? text.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim()
      : text;
    if (!line) return { data: null, sessionId: nextSession };
    return { data: JSON.parse(line) as RpcResult, sessionId: nextSession };
  } catch {
    return { data: null, sessionId };
  }
}

/** Nombres de herramienta que suenan a "búscame en el catálogo". */
const SEARCHY = /(search|buscar|busca|catalog|catálogo|list|listar|product|propert|unidad|inventor|price|precio)/i;
/** Propiedades de entrada que aceptan una consulta en texto. */
const QUERY_KEYS = ['query', 'q', 'search', 'text', 'term', 'consulta', 'busqueda', 'búsqueda'];

function buildArgs(schema: any, query: string): Record<string, unknown> | null {
  const props = schema?.properties ?? {};
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const args: Record<string, unknown> = {};

  const queryProp = Object.keys(props).find((k) => QUERY_KEYS.includes(k.toLowerCase()));
  if (queryProp) args[queryProp] = query;

  // Si la herramienta exige algo que no sabemos llenar, no la llamamos: mandar
  // basura a la API del cliente es peor que no consultar.
  for (const r of required) {
    if (r in args) continue;
    if (props[r]?.type === 'string') args[r] = query;
    else return null;
  }
  return Object.keys(args).length > 0 || required.length === 0 ? args : null;
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((c: any) => (c?.type === 'text' ? String(c.text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

export interface McpSnippet {
  source: string;
  tool: string;
  text: string;
}

/** Consulta una fuente MCP. Devuelve [] si no se pudo — nunca lanza. */
async function querySource(source: McpSource, query: string, maxTools: number): Promise<McpSnippet[]> {
  const init = await rpc(
    source.url,
    'initialize',
    { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    null,
  );
  if (!init.data?.result) return [];
  const session = init.sessionId;

  const listed = await rpc(source.url, 'tools/list', {}, session);
  const tools: Array<{ name?: string; description?: string; inputSchema?: any }> =
    listed.data?.result?.tools ?? [];
  const candidates = tools
    .filter((t) => t.name && SEARCHY.test(`${t.name} ${t.description ?? ''}`))
    .slice(0, maxTools);

  const out: McpSnippet[] = [];
  for (const tool of candidates) {
    const args = buildArgs(tool.inputSchema, query);
    if (!args) continue;
    const called = await rpc(source.url, 'tools/call', { name: tool.name, arguments: args }, session);
    const text = textFromContent(called.data?.result?.content);
    if (text.trim()) out.push({ source: source.label, tool: tool.name!, text: text.slice(0, 1200) });
  }
  return out;
}

/**
 * Catálogo/precios del cliente para esta consulta. Todas las fuentes en
 * paralelo; lo que falle, se ignora.
 */
export async function mcpCatalogContext(
  sources: McpSource[],
  query: string,
  opts: { maxSources?: number; maxToolsPerSource?: number } = {},
): Promise<McpSnippet[]> {
  const list = (sources ?? []).slice(0, opts.maxSources ?? 3);
  if (list.length === 0 || !query.trim()) return [];
  const results = await Promise.all(
    list.map((s) => querySource(s, query, opts.maxToolsPerSource ?? 2).catch(() => [] as McpSnippet[])),
  );
  return results.flat();
}
