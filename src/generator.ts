import { chat, chatJSON } from './openrouter';
import { config, type Platform } from './config';
import { recall } from './memory/index';
import { playbookDe, type RedPublicable } from './creative/social-playbooks';

const RED_DE_PLATAFORMA: Record<Platform, RedPublicable> = {
  meta: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  linkedin: 'linkedin',
};

export const PLATFORM_LIMITS = Object.fromEntries(
  (Object.keys(RED_DE_PLATAFORMA) as Platform[]).map((platform) => {
    const p = playbookDe(RED_DE_PLATAFORMA[platform]);
    return [platform, { maxChars: p.caracteresMax, hashtags: p.hashtagsMax, style: p.tono }];
  }),
) as Record<Platform, { maxChars: number; hashtags: number; style: string }>;

export interface ProjectBrandVoice {
  name: string;
  voice?: string | null;
  topics?: string[] | null;
  language?: string | null;
}

function systemPrompt(brand?: ProjectBrandVoice): string {
  const name = brand?.name?.trim() || config.brand.name;
  const voice = brand?.voice?.trim() || config.brand.voice;
  const topics = brand?.topics?.filter(Boolean) ?? config.brand.topics;
  const language = brand?.language?.trim() || config.brand.language;
  return [
    `You are the social media manager for "${name}".`,
    `Voice: ${voice}. Language: ${language}.`,
    `Topics of expertise: ${topics.join(', ')}.`,
    `Never invent statistics. Avoid hashtag spam. Never use the word "delve" or em-dashes.`,
  ].join(' ');
}

async function buildContext(topic: string, platform: Platform, projectId?: string): Promise<string> {
  try {
    const memories = (await recall(`${platform} post about ${topic}`, { k: projectId ? 25 : 5 }))
      .filter((m) => !projectId || m.metadata?.projectId === projectId)
      .slice(0, 5);
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
  /** Marca DEL PROYECTO. Si falta, solo los procesos globales usan config.brand. */
  brand?: ProjectBrandVoice;
  /** Evita que el copy de un cliente recuerde publicaciones de otro. */
  projectId?: string;
}

export async function generatePost(input: GenerateInput): Promise<string> {
  const red = RED_DE_PLATAFORMA[input.platform] ?? 'twitter';
  const playbook = playbookDe(red);
  const limits = PLATFORM_LIMITS[input.platform] ?? PLATFORM_LIMITS.twitter;
  const context = await buildContext(input.topic, input.platform, input.projectId);

  const user = [
    `Write a native ${red} post. It must not read like a recycled caption from another network.`,
    `Topic: ${input.topic}.`,
    input.angle ? `Angle: ${input.angle}.` : '',
    `Platform objective: ${playbook.objetivo}`,
    `Copy structure: ${playbook.estructuraCopy}`,
    `Tone: ${playbook.tono}`,
    `Call to action: ${playbook.cta}`,
    `Hard limit: ${limits.maxChars} characters including hashtags.`,
    `Use at most ${limits.hashtags} relevant hashtags at the end.`,
    `Do not invent data, awards, availability, prices or customer claims.`,
    context,
    `Return ONLY the post body. No preface, no quotes.`,
  ].filter(Boolean).join('\n');

  const text = await chat([
    { role: 'system', content: systemPrompt(input.brand) },
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
