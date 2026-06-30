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
  const completion = await getClient().chat.completions.create({
    model: opts.model || config.openrouter.model,
    messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: maxTokens,
  });
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
