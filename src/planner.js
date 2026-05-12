const { generateWeeklyPlan } = require('./generator');
const { enabledPosters } = require('./posters');
const { writeJSON, readJSON } = require('./storage');

const PLAN_FILE = 'plan.json';

async function buildPlan() {
  const platforms = enabledPosters().map((p) => p.platform);
  if (platforms.length === 0) {
    throw new Error('No platforms enabled. Set TWITTER_ENABLED or LINKEDIN_ENABLED in .env');
  }
  const items = await generateWeeklyPlan({ platforms });
  const plan = {
    createdAt: new Date().toISOString(),
    platforms,
    items: items.map((it, i) => ({ id: `${Date.now()}-${i}`, used: false, ...it })),
  };
  writeJSON(PLAN_FILE, plan);
  return plan;
}

function loadPlan() {
  return readJSON(PLAN_FILE, null);
}

function nextUnusedItem(plan, platform) {
  if (!plan?.items) return null;
  return plan.items.find((it) => !it.used && it.platform === platform) || null;
}

function markUsed(plan, itemId) {
  const item = plan.items.find((it) => it.id === itemId);
  if (item) item.used = true;
  writeJSON(PLAN_FILE, plan);
}

module.exports = { buildPlan, loadPlan, nextUnusedItem, markUsed, PLAN_FILE };
