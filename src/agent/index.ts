import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config';
import { agentTools } from './tools/index';
import { buildOperatorManifesto } from './manifesto';
import { getIdentity, identityBlock } from './identity';
import { getMastraMemory, memoryIdsFor } from './memory';
import { askGeminiVision } from '../../lib/gemini-vision';
import type { AgentIdentity } from '../db/schema';

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

function composeInstructions(
  brand: { name: string; voice: string; topics: string[]; language: string },
  campaignManifesto: string | null | undefined,
  identity: AgentIdentity | null,
): string {
  const base = buildOperatorManifesto(brand, campaignManifesto);
  const idBlock = identityBlock(identity);
  return idBlock ? `${base}\n\n${idBlock}` : base;
}

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

export type DraftPost = { platform: 'twitter' | 'linkedin'; text: string; topic?: string };

export type AgentReply = { text: string; draftPost?: DraftPost };

function extractText(result: unknown): string {
  const r = result as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}

// Busca si el agente uso la tool generate-post en este turno. Si la uso,
// extrae {platform, text} para que el chat pueda mostrar un boton de
// "publicar este post" en vez de obligar al usuario a copiar/pegar texto.
function extractDraftPost(result: unknown): DraftPost | undefined {
  const r = result as { toolResults?: Array<{ payload?: { toolName?: string; args?: any; result?: any } }> };
  const calls = r.toolResults ?? [];
  for (let i = calls.length - 1; i >= 0; i--) {
    const payload = calls[i]?.payload;
    if (payload?.toolName === 'generatePost' && payload.result?.text) {
      const platform = payload.args?.platform === 'linkedin' ? 'linkedin' : 'twitter';
      return { platform, text: String(payload.result.text), topic: payload.args?.topic };
    }
  }
  return undefined;
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

export async function askWithHistoryForCampaign(
  history: ChatTurn[],
  prompt: string,
  campaign: {
    name: string;
    brandVoice?: string | null;
    brandTopics?: string | null;
    brandLanguage?: string | null;
    manifesto?: string | null;
  } | null,
  userId?: string | null,
  imageDataUrl?: string | null,
): Promise<AgentReply> {
  const brand = campaign
    ? {
        name: campaign.name,
        voice: campaign.brandVoice ?? config.brand.voice,
        topics: (campaign.brandTopics ?? config.brand.topics.join(','))
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        language: campaign.brandLanguage ?? config.brand.language,
      }
    : config.brand;

  const identity = userId ? await getIdentity(userId).catch(() => null) : null;
  const instructions = composeInstructions(brand, campaign?.manifesto ?? null, identity);

  // El Mesh (Cerebras gpt-oss-120b) es texto puro, no ve imagenes. Si el
  // mensaje trae una foto, este turno lo resuelve Gemini directo (si que
  // tiene vision) en vez del agente con tools. Se pierde tool-calling SOLO
  // en ese mensaje puntual; el resto de la conversacion sigue por el Mesh.
  if (imageDataUrl) {
    const text = await askGeminiVision(instructions, history, prompt, imageDataUrl);
    return { text };
  }

  const ids = userId ? memoryIdsFor(userId) : null;

  const perRequestAgent = new Agent({
    id: `goossip${campaign ? '-' + campaign.name.toLowerCase().replace(/\s+/g, '-').slice(0, 30) : ''}`,
    name: 'goossip',
    instructions,
    model: buildModel(),
    tools: agentTools,
    ...(memory ? { memory } : {}),
  } as never);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: prompt },
  ];

  const genOpts: Record<string, unknown> = { ...MODEL_SETTINGS };
  if (memory && ids) genOpts.memory = ids;

  const result = await perRequestAgent.generate(messages as never, genOpts as never);
  return { text: extractText(result), draftPost: extractDraftPost(result) };
}
