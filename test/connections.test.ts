import 'dotenv/config';
import { config } from '../src/config.js';
import { getClient as openrouterClient } from '../src/openrouter.js';
import { twitter, linkedin } from '../src/posters/index.js';
import { embed } from '../src/memory/embed.js';

interface Check { name: string; fn: () => Promise<void> }

const checks: Check[] = [];
const add = (name: string, fn: () => Promise<void>) => checks.push({ name, fn });

add('openrouter env', async () => {
  if (!config.openrouter.apiKey) throw new Error('OPENROUTER_API_KEY missing');
  openrouterClient();
});

add('embeddings api', async () => {
  if (!config.embeddings.apiKey) throw new Error('OPENAI_API_KEY missing (used for embeddings)');
  const v = await embed('hello world');
  if (!Array.isArray(v) || v.length !== config.embeddings.dimensions) {
    throw new Error(`unexpected embedding length: ${v.length}`);
  }
});

add('database url', async () => {
  if (!config.db.url) throw new Error('DATABASE_URL missing');
});

if (config.twitter.enabled) {
  add('twitter auth', async () => { const r = await twitter.check(); if (!r.ok) throw new Error('failed'); });
}
if (config.linkedin.enabled) {
  add('linkedin auth', async () => { const r = await linkedin.check(); if (!r.ok) throw new Error('failed'); });
}

(async () => {
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`ok   - ${c.name}`);
    } catch (err: any) {
      failed += 1;
      console.error(`FAIL - ${c.name}: ${err.message ?? err}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
