import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config.js';
import { agentTools } from './tools/index.js';

function buildModel() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }
  const provider = createOpenRouter({ apiKey: config.openrouter.apiKey });
  return provider.chat(config.openrouter.model);
}

function buildInstructions(): string {
  const { name, voice, topics, language } = config.brand;
  return [
    `You are the autonomous social media manager for "${name}".`,
    `Voice: ${voice}. Language: ${language}.`,
    `Topics of expertise: ${topics.join(', ')}.`,
    ``,
    `## Operating rules`,
    `- Never invent statistics. If you do not know a number, omit it.`,
    `- Avoid hashtag spam. Never use the word "delve" or em-dashes.`,
    `- Before drafting a new post, call recall-memory to check we have not said the same thing recently.`,
    `- Use list-recent-posts when the user asks about what we have already posted.`,
    `- Use save-knowledge when the user gives you facts to remember long-term.`,
    `- Use plan-week to build a weekly schedule on request.`,
    `- Use generate-post to draft, then publish-post ONLY after explicit user approval`,
    `  unless the user clearly told you to auto-publish.`,
    `- Always cite the tool you intend to use in your response if helpful.`,
  ].join('\n');
}

export const socialAgent = new Agent({
  id: 'social-media-agent',
  name: 'social-media-agent',
  instructions: buildInstructions(),
  model: buildModel(),
  tools: agentTools,
});

export async function ask(prompt: string): Promise<string> {
  const result = await socialAgent.generate(prompt);
  const r = result as unknown as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? JSON.stringify(result);
}
