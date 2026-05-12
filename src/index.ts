#!/usr/bin/env node
import { runOnce } from './runner.js';
import { buildPlan, latestPlan } from './planner.js';
import { start } from './scheduler.js';
import { recall, remember } from './memory/index.js';
import { db } from './db/client.js';
import { knowledge } from './db/schema.js';
import { readFile } from 'node:fs/promises';
import { ask } from './agent/index.js';

const USAGE = `Usage:
  npm run dev -- run [--dry]            Generate and publish one round of posts
  npm run dev -- plan                   Build a new weekly content plan
  npm run dev -- show-plan              Print stored plan items
  npm run dev -- start                  Start the 24/7 scheduler
  npm run dev -- recall "<query>"       Test semantic recall
  npm run dev -- ingest <file>          Ingest a text/markdown file into knowledge
  npm run dev -- ask "<instruction>"    Talk to the Mastra agent (tool calling)
`;

async function ingest(filePath: string): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  const chunks = content
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 40);
  for (const chunk of chunks) {
    const [row] = await db.insert(knowledge).values({ content: chunk, source: filePath }).returning({ id: knowledge.id });
    if (row) await remember({ refType: 'knowledge', refId: row.id, content: chunk });
  }
  console.log(`Ingested ${chunks.length} chunk(s) from ${filePath}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'run': {
      const dryRun = rest.includes('--dry');
      const results = await runOnce({ dryRun });
      for (const r of results) console.log(`\n--- ${r.platform} ---\n${r.text}\n${JSON.stringify(r.posted)}`);
      break;
    }
    case 'plan': {
      const plan = await buildPlan();
      console.log(`plan ${plan.planId}: ${plan.items.length} items`);
      console.log(JSON.stringify(plan.items, null, 2));
      break;
    }
    case 'show-plan': {
      const items = await latestPlan();
      console.log(JSON.stringify(items, null, 2));
      break;
    }
    case 'recall': {
      const q = rest.join(' ');
      if (!q) { console.error('Provide a query'); process.exit(1); }
      const hits = await recall(q);
      console.log(JSON.stringify(hits, null, 2));
      break;
    }
    case 'ingest': {
      const path = rest[0];
      if (!path) { console.error('Provide a file path'); process.exit(1); }
      await ingest(path);
      break;
    }
    case 'ask': {
      const prompt = rest.join(' ').trim();
      if (!prompt) { console.error('Provide a prompt'); process.exit(1); }
      const reply = await ask(prompt);
      console.log(reply);
      break;
    }
    case 'start':
    case undefined:
      start();
      console.log('[scheduler] running. Press Ctrl+C to stop.');
      break;
    default:
      process.stdout.write(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
