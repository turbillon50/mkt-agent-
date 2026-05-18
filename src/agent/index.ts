import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config';
import { agentTools } from './tools/index';
import { buildOperatorManifesto } from './manifesto';
import { getIdentity, identityBlock } from './identity';
import { getMastraMemory, memoryIdsFor } from './memory';
import type { AgentIdentity } from '../db/schema';

function buildModel() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenRouter({ apiKey: config.openrouter.apiKey });
  return provider.chat(config.openrouter.modelAgent);
}

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

export async function ask(prompt: string): Promise<string> {
  const result = await socialAgent.generate(prompt);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}

export async function askWithHistory(history: ChatTurn[], prompt: string): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: prompt },
  ];
  const result = await socialAgent.generate(messages as never);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
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
): Promise<string> {
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
  const ids = userId ? memoryIdsFor(userId) : null;

  const perRequestAgent = new Agent({
    id: `goossip${campaign ? '-' + campaign.name.toLowerCase().replace(/\s+/g, '-').slice(0, 30) : ''}`,
    name: 'goossip',
    instructions: composeInstructions(brand, campaign?.manifesto ?? null, identity),
    model: buildModel(),
    tools: agentTools,
    ...(memory ? { memory } : {}),
  } as never);

  const userContent: unknown = imageDataUrl
    ? [
        { type: 'text', text: prompt },
        { type: 'image', image: imageDataUrl },
      ]
    : prompt;

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userContent },
  ];

  const genOpts: Record<string, unknown> = {};
  if (memory && ids) genOpts.memory = ids;

  const result = await perRequestAgent.generate(messages as never, genOpts as never);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}
