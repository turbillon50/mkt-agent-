import { chat, chatJSON } from './openrouter';
import { config, type Platform } from './config';
import { recall } from './memory/index';

const PLATFORM_LIMITS = {
  twitter: { maxChars: 270, hashtags: 2, style: 'punchy, conversational, one idea per post' },
  linkedin: { maxChars: 1500, hashtags: 4, style: 'professional, insightful, 1-3 short paragraphs' },
} as const;

function systemPrompt(): string {
  const { name, voice, topics, language } = config.brand;
  return [
    `You are the social media manager for "${name}".`,
    `Voice: ${voice}. Language: ${language}.`,
    `Topics of expertise: ${topics.join(', ')}.`,
    `Never invent statistics. Avoid hashtag spam. Never use the word "delve" or em-dashes.`,
  ].join(' ');
}

async function buildContext(topic: string, platform: Platform): Promise<string> {
  try {
    const memories = await recall(`${platform} post about ${topic}`, { k: 5 });
    if (memories.length === 0) return '';
    return [
      'Recent / similar prior posts (do not repeat phrasing, build on these):',
      ...memories.map((m, i) => `  [${i + 1}] (sim=${m.similarity.toFixed(2)}) ${m.content.slice(0, 200)}`),
    ].join('\n');
  } catch {
    return '';
  }
}

export interface GenerateInput {
  platform: Platform;
  topic: string;
  angle?: string;
}

export async function generatePost(input: GenerateInput): Promise<string> {
  const limits = PLATFORM_LIMITS[input.platform] ?? PLATFORM_LIMITS.twitter;
  const context = await buildContext(input.topic, input.platform);

  const user = [
    `Write a ${input.platform} post.`,
    `Topic: ${input.topic}.`,
    input.angle ? `Angle: ${input.angle}.` : '',
    `Style: ${limits.style}.`,
    `Hard limit: ${limits.maxChars} characters including hashtags.`,
    `Use at most ${limits.hashtags} relevant hashtags at the end.`,
    context,
    `Return ONLY the post body. No preface, no quotes.`,
  ].filter(Boolean).join('\n');

  const text = await chat([
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ], {
    temperature: 0.85,
    maxTokens: 600,
    model: config.openrouter.modelDraft,
  });

  return text.length > limits.maxChars ? text.slice(0, limits.maxChars).trim() : text;
}

export interface PlanItemDraft {
  dayOffset: number;
  platform: Platform;
  topic: string;
  angle?: string;
}

export async function generateWeeklyPlan(opts: {
  platforms: Platform[];
  postsPerDay?: number;
}): Promise<PlanItemDraft[]> {
  const postsPerDay = opts.postsPerDay ?? 1;
  const user = [
    `Build a 7-day social media content plan starting today.`,
    `Platforms: ${opts.platforms.join(', ')}.`,
    `Posts per platform per day: ${postsPerDay}.`,
    `For each item include: dayOffset (0-6), platform, topic, angle.`,
    `Topics should rotate across: ${config.brand.topics.join(', ')}.`,
    `Return strict JSON: { "items": [{ "dayOffset": 0, "platform": "twitter", "topic": "...", "angle": "..." }] }`,
  ].join('\n');

  const json = await chatJSON<{ items: PlanItemDraft[] }>([
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ], {
    temperature: 0.7,
    maxTokens: 1500,
    model: config.openrouter.modelPlan,
  });

  if (!json || !Array.isArray(json.items)) throw new Error('Planner returned invalid JSON.');
  return json.items;
}

export { PLATFORM_LIMITS };
