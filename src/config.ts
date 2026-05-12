import 'dotenv/config';

const truthy = (v: unknown) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

export const config = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  },
  embeddings: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    dimensions: 1536,
  },
  db: {
    url: process.env.DATABASE_URL ?? '',
  },
  brand: {
    name: process.env.BRAND_NAME || 'My Brand',
    voice: process.env.BRAND_VOICE || 'friendly, concise, expert',
    topics: (process.env.BRAND_TOPICS || 'marketing,automation,ai')
      .split(',').map((s) => s.trim()).filter(Boolean),
    language: process.env.BRAND_LANGUAGE || 'en',
  },
  schedule: {
    postCron: process.env.POST_CRON || '0 9,18 * * *',
    planCron: process.env.PLAN_CRON || '0 8 * * 1',
    timezone: process.env.TIMEZONE || 'UTC',
  },
  twitter: {
    enabled: truthy(process.env.TWITTER_ENABLED),
    appKey: process.env.TWITTER_APP_KEY ?? '',
    appSecret: process.env.TWITTER_APP_SECRET ?? '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN ?? '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET ?? '',
  },
  linkedin: {
    enabled: truthy(process.env.LINKEDIN_ENABLED),
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN ?? '',
    authorUrn: process.env.LINKEDIN_AUTHOR_URN ?? '',
  },
  memory: {
    recallK: Number(process.env.MEMORY_RECALL_K ?? 5),
    minSimilarity: Number(process.env.MEMORY_MIN_SIMILARITY ?? 0.78),
  },
} as const;

export type Platform = 'twitter' | 'linkedin';
