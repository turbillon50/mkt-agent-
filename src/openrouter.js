const OpenAI = require('openai');
const config = require('./config');

let client = null;

function getClient() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Configure it in .env');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openrouter.apiKey,
      baseURL: config.openrouter.baseUrl,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/turbillon50/mkt-agent-',
        'X-Title': 'social-media-agent',
      },
    });
  }
  return client;
}

async function chat(messages, { temperature = 0.8, maxTokens = 800 } = {}) {
  const completion = await getClient().chat.completions.create({
    model: config.openrouter.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

async function chatJSON(messages, opts = {}) {
  const raw = await chat(messages, opts);
  const match = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
  const text = match ? match[1] : raw;
  return JSON.parse(text);
}

module.exports = { chat, chatJSON, getClient };
