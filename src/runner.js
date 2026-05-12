const { generatePost } = require('./generator');
const { enabledPosters, getPoster } = require('./posters');
const { buildPlan, loadPlan, nextUnusedItem, markUsed } = require('./planner');
const { appendLog } = require('./storage');
const config = require('./config');

function pickFallbackTopic() {
  const t = config.brand.topics;
  return t[Math.floor(Math.random() * t.length)];
}

async function runOnce({ dryRun = false } = {}) {
  const posters = enabledPosters();
  if (posters.length === 0) {
    throw new Error('No platforms enabled. Set TWITTER_ENABLED or LINKEDIN_ENABLED in .env');
  }

  let plan = loadPlan();
  if (!plan) plan = await buildPlan();

  const results = [];
  for (const poster of posters) {
    let item = nextUnusedItem(plan, poster.platform);
    if (!item) {
      item = { topic: pickFallbackTopic(), angle: 'fresh take', platform: poster.platform };
    }
    const text = await generatePost(item);
    let posted = { dryRun: true };
    if (!dryRun) {
      posted = await poster.post(text);
      if (item.id) markUsed(plan, item.id);
    }
    appendLog('history.json', { platform: poster.platform, topic: item.topic, text, posted });
    results.push({ platform: poster.platform, text, posted });
  }
  return results;
}

module.exports = { runOnce };
