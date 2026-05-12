/* Minimal connection sanity check. Exits non-zero on any failure. */
const config = require('../src/config');
const { getClient } = require('../src/openrouter');
const { twitter, linkedin } = require('../src/posters');

const checks = [];

function add(name, fn) { checks.push({ name, fn }); }

add('openrouter env', async () => {
  if (!config.openrouter.apiKey) throw new Error('OPENROUTER_API_KEY missing');
  getClient();
});

if (config.twitter.enabled) {
  add('twitter auth', async () => {
    const r = await twitter.check();
    if (!r.ok) throw new Error('twitter check failed');
  });
}

if (config.linkedin.enabled) {
  add('linkedin auth', async () => {
    const r = await linkedin.check();
    if (!r.ok) throw new Error('linkedin check failed');
  });
}

(async () => {
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`ok  - ${c.name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL - ${c.name}: ${err.message}`);
    }
  }
  if (checks.length === 0) {
    console.log('No checks ran. Enable at least one platform in .env');
  }
  process.exit(failed ? 1 : 0);
})();
