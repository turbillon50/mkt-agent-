#!/usr/bin/env node
const { runOnce } = require('./runner');
const { buildPlan, loadPlan } = require('./planner');
const scheduler = require('./scheduler');

const USAGE = `Usage:
  node src/index.js run [--dry]    Generate and publish one round of posts
  node src/index.js plan           Build (or rebuild) the weekly content plan
  node src/index.js show-plan      Print the current plan
  node src/index.js start          Start the 24/7 cron scheduler
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'run': {
      const dryRun = rest.includes('--dry');
      const results = await runOnce({ dryRun });
      for (const r of results) {
        console.log(`\n--- ${r.platform} ---\n${r.text}\n${JSON.stringify(r.posted)}`);
      }
      break;
    }
    case 'plan': {
      const plan = await buildPlan();
      console.log(JSON.stringify(plan, null, 2));
      break;
    }
    case 'show-plan': {
      const plan = loadPlan();
      if (!plan) {
        console.log('No plan yet. Run: node src/index.js plan');
        return;
      }
      console.log(JSON.stringify(plan, null, 2));
      break;
    }
    case 'start':
    case undefined: {
      scheduler.start();
      console.log('[scheduler] running. Press Ctrl+C to stop.');
      break;
    }
    default:
      process.stdout.write(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
