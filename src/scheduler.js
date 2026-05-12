const cron = require('node-cron');
const config = require('./config');
const { runOnce } = require('./runner');
const { buildPlan } = require('./planner');

function start() {
  const { postCron, planCron, timezone } = config.schedule;

  console.log(`[scheduler] post cron "${postCron}" (${timezone})`);
  console.log(`[scheduler] plan cron "${planCron}" (${timezone})`);

  cron.schedule(postCron, async () => {
    try {
      const results = await runOnce();
      console.log(`[scheduler] posted ${results.length} item(s) at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('[scheduler] post run failed:', err.message);
    }
  }, { timezone });

  cron.schedule(planCron, async () => {
    try {
      const plan = await buildPlan();
      console.log(`[scheduler] new weekly plan: ${plan.items.length} items`);
    } catch (err) {
      console.error('[scheduler] plan run failed:', err.message);
    }
  }, { timezone });

  process.on('SIGINT', () => { console.log('\n[scheduler] stopping'); process.exit(0); });
  process.on('SIGTERM', () => { console.log('\n[scheduler] stopping'); process.exit(0); });
}

module.exports = { start };
