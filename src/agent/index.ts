import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config';
import { agentTools } from './tools/index';
import { buildManifesto } from './manifesto';

function buildModel() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenRouter({ apiKey: config.openrouter.apiKey });
  return provider.chat(config.openrouter.modelAgent);
}

export const socialAgent = new Agent({
  id: 'goossip',
  name: 'goossip',
  instructions: buildManifesto(config.brand),
  model: buildModel(),
  tools: agentTools,
});

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** One-shot, no history (used by CLI / cron / WA handler). */
export async function ask(prompt: string): Promise<string> {
  const result = await socialAgent.generate(prompt);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}

/** Conversational, with prior history threaded in (used by /api/chat). */
export async function askWithHistory(history: ChatTurn[], prompt: string): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: prompt },
  ];
  const result = await socialAgent.generate(messages as never);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}
