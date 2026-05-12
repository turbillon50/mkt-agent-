const { chat, chatJSON } = require('./openrouter');
const config = require('./config');

const PLATFORM_LIMITS = {
  twitter: { maxChars: 270, hashtags: 2, style: 'punchy, conversational, one idea per post' },
  linkedin: { maxChars: 1500, hashtags: 4, style: 'professional, insightful, 1-3 short paragraphs' },
};

function systemPrompt() {
  const { name, voice, topics, language } = config.brand;
  return [
    `You are the social media manager for "${name}".`,
    `Voice: ${voice}. Language: ${language}.`,
    `Topics of expertise: ${topics.join(', ')}.`,
    `Never invent statistics. Avoid hashtag spam. Never use the word "delve" or em-dashes.`,
  ].join(' ');
}

async function generatePost({ platform, topic, angle }) {
  const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.twitter;
  const user = [
    `Write a ${platform} post.`,
    `Topic: ${topic}.`,
    angle ? `Angle: ${angle}.` : '',
    `Style: ${limits.style}.`,
    `Hard limit: ${limits.maxChars} characters including hashtags.`,
    `Use at most ${limits.hashtags} relevant hashtags at the end.`,
    `Return ONLY the post body. No preface, no quotes.`,
  ].filter(Boolean).join('\n');

  const text = await chat([
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ], { temperature: 0.85, maxTokens: 600 });

  return text.length > limits.maxChars ? text.slice(0, limits.maxChars).trim() : text;
}

async function generateWeeklyPlan({ platforms, postsPerDay = 1 }) {
  const user = [
    `Build a 7-day social media content plan starting today.`,
    `Platforms: ${platforms.join(', ')}.`,
    `Posts per platform per day: ${postsPerDay}.`,
    `For each item include: dayOffset (0-6), platform, topic, angle.`,
    `Topics should rotate across: ${config.brand.topics.join(', ')}.`,
    `Return strict JSON: { "items": [{ "dayOffset": 0, "platform": "twitter", "topic": "...", "angle": "..." }] }`,
  ].join('\n');

  const json = await chatJSON([
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ], { temperature: 0.7, maxTokens: 1500 });

  if (!json || !Array.isArray(json.items)) {
    throw new Error('Planner returned invalid JSON.');
  }
  return json.items;
}

module.exports = { generatePost, generateWeeklyPlan, PLATFORM_LIMITS };
