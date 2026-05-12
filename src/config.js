require('dotenv').config();

const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

const config = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
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
    appKey: process.env.TWITTER_APP_KEY,
    appSecret: process.env.TWITTER_APP_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  },
  linkedin: {
    enabled: truthy(process.env.LINKEDIN_ENABLED),
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    authorUrn: process.env.LINKEDIN_AUTHOR_URN,
  },
  dataDir: process.env.DATA_DIR || './data',
};

module.exports = config;
