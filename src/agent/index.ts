import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config';
import { agentTools } from './tools/index';
import { buildOperatorManifesto } from './manifesto';

function buildModel() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenRouter({ apiKey: config.openrouter.apiKey });
  return provider.chat(config.openrouter.modelAgent);
}

/** Global agent with the default operator manifesto. Used for CLI / cron. */
export const socialAgent = new Agent({
  id: 'goossip',
  name: 'goossip',
  instructions: buildOperatorManifesto(config.brand),
  model: buildModel(),
  tools: agentTools,
});

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

/**
 * Conversational with per-campaign manifesto override. We rebuild a thin
 * Agent per request because Mastra bakes instructions at construction
 * time. The model + tools are reused. Constructing an Agent is cheap;
 * only the LLM call costs.
 */
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
): Promise<string> {
  if (!campaign) return askWithHistory(history, prompt);

  const brand = {
    name: campaign.name,
    voice: campaign.brandVoice ?? config.brand.voice,
    topics: (campaign.brandTopics ?? config.brand.topics.join(','))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    language: campaign.brandLanguage ?? config.brand.language,
  };

  const perCampaignAgent = new Agent({
    id: `goossip-${campaign.name.toLowerCase().replace(/\s+/g, '-').slice(0, 30) || 'campaign'}`,
    name: 'goossip',
    instructions: buildOperatorManifesto(brand, campaign.manifesto),
    model: buildModel(),
    tools: agentTools,
  });

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: prompt },
  ];
  const result = await perCampaignAgent.generate(messages as never);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}
