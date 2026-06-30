import OpenAI from 'openai';
import { config } from './config';

let client: OpenAI | null = null;

export function getClient(): OpenAI {
  if (!config.openrouter.apiKey) {
    throw new Error(`${config.openrouter.provider.toUpperCase()}_API_KEY is not set.`);
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openrouter.apiKey,
      baseURL: config.openrouter.baseUrl,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/turbillon50/mkt-agent-',
        'X-Title': 'social-media-agent',
      },
    });
  }
  return client;
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; model?: string } = {},
): Promise<string> {
  const requested = opts.maxTokens ?? 800;
  const maxTokens = Math.max(requested, config.openrouter.minMaxTokens);
  let completion;
  try {
    completion = await getClient().chat.completions.create({
      model: opts.model || config.openrouter.model,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: maxTokens,
    });
  } catch (e: any) {
    // Errores del proveedor (Mesh/Cerebras) llegan como APIError del SDK. Se
    // re-lanzan con contexto claro para que un 401 (MESH_API_KEY mala, p.ej. un
    // valor cifrado en vez de la key plana del tenant) sea diagnosticable al
    // instante en vez de un "agent error" genérico.
    const status = e?.status ?? e?.response?.status;
    const detail = e?.message ?? 'error desconocido';
    if (status === 401 || status === 403) {
      throw new Error(
        `El proveedor de IA (Mesh) rechazó la autenticación (${status}). Revisa que MESH_API_KEY sea la key plana del tenant, no un valor cifrado. Detalle: ${detail}`,
      );
    }
    throw new Error(`El proveedor de IA (Mesh) falló${status ? ` (${status})` : ''}: ${detail}`);
  }
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; model?: string } = {},
): Promise<T> {
  const raw = await chat(messages, opts);
  const match = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
  const text = match ? match[1]! : raw;
  return JSON.parse(text) as T;
}
