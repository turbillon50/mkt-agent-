import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config';
import { agentTools } from './tools/index';
import { buildOperatorManifesto } from './manifesto';
import { getMastraMemory } from './memory';

// Mesh Router propio (Cerebras + GPUs propias) hablando el protocolo
// OpenAI-compatible — por eso usamos el provider generico de OpenAI en vez
// del de OpenRouter. Cero dependencia de OpenRouter.
function buildModel() {
  if (!config.openrouter.apiKey) {
    throw new Error('MESH_API_KEY is not set.');
  }
  const provider = createOpenAI({
    apiKey: config.openrouter.apiKey,
    baseURL: config.openrouter.baseUrl,
  });
  return provider.chat(config.openrouter.modelAgent);
}

// gpt-oss-120b razona antes de contestar — sin un piso de tokens de salida
// se queda a medias. Esto se inyecta en cada llamada a .generate().
const MODEL_SETTINGS = { maxOutputTokens: config.openrouter.minMaxTokens || 800 };

const memory = getMastraMemory();

export const socialAgent = new Agent({
  id: 'goossip',
  name: 'goossip',
  instructions: buildOperatorManifesto(config.brand),
  model: buildModel(),
  tools: agentTools,
  ...(memory ? { memory } : {}),
} as never);

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

function extractText(result: unknown): string {
  const r = result as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}

export async function ask(prompt: string): Promise<string> {
  const result = await socialAgent.generate(prompt, MODEL_SETTINGS as never);
  return extractText(result);
}

export async function askWithHistory(history: ChatTurn[], prompt: string): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: prompt },
  ];
  const result = await socialAgent.generate(messages as never, MODEL_SETTINGS as never);
  return extractText(result);
}

/**
 * El chat GLOBAL se fue en la corrida 6.
 *
 * Aquí vivía `askWithHistoryForCampaign`, que armaba un agente por "campaña"
 * pero cuyas tools no sabían de ningún proyecto y publicaban con la cuenta de
 * la casa — el pendiente exacto que Luis dictó para esta corrida. Se borró en
 * vez de dejarse apagada: una función exportada es una puerta que alguien
 * vuelve a abrir.
 *
 * El Asistente vive ahora en `src/agent/project-agent.ts`, siempre dentro de un
 * proyecto y con las tools atadas a él.
 */
