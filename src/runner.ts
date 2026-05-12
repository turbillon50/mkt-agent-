import { db } from './db/client.js';
import { posts } from './db/schema.js';
import { generatePost } from './generator.js';
import { enabledPosters } from './posters/index.js';
import { buildPlan, nextUnusedItem, markUsed } from './planner.js';
import { remember } from './memory/index.js';
import { config, type Platform } from './config.js';

function pickFallbackTopic(): string {
  const t = config.brand.topics;
  return t[Math.floor(Math.random() * t.length)] ?? 'marketing';
}

export interface RunResult {
  platform: Platform;
  text: string;
  posted: { id?: string; url?: string; dryRun?: boolean };
}

export async function runOnce(opts: { dryRun?: boolean } = {}): Promise<RunResult[]> {
  const posters = enabledPosters();
  if (posters.length === 0) {
    throw new Error('No platforms enabled. Set TWITTER_ENABLED or LINKEDIN_ENABLED in .env');
  }

  const results: RunResult[] = [];

  for (const poster of posters) {
    const planned = await nextUnusedItem(poster.platform);
    const item = planned ?? {
      id: null as string | null,
      topic: pickFallbackTopic(),
      angle: 'fresh take',
      platform: poster.platform,
    };

    const text = await generatePost({
      platform: poster.platform,
      topic: item.topic,
      angle: item.angle ?? undefined,
    });

    let externalId: string | undefined;
    let externalUrl: string | undefined;

    if (opts.dryRun) {
      results.push({ platform: poster.platform, text, posted: { dryRun: true } });
      continue;
    }

    const out = await poster.post(text);
    externalId = out.id;
    externalUrl = out.url;

    const [row] = await db.insert(posts).values({
      platform: poster.platform,
      text,
      topic: item.topic,
      angle: item.angle ?? null,
      externalId,
      externalUrl,
      publishedAt: new Date(),
    }).returning({ id: posts.id });

    if (row) {
      await remember({
        refType: 'post',
        refId: row.id,
        content: `${item.topic} | ${text}`,
        metadata: { platform: poster.platform, topic: item.topic },
      }).catch((err) => console.warn('[runner] remember failed:', err.message));
    }

    if (planned?.id) await markUsed(planned.id);

    results.push({ platform: poster.platform, text, posted: { id: externalId, url: externalUrl } });
  }

  return results;
}

export async function ensurePlan(): Promise<void> {
  const platforms = enabledPosters().map((p) => p.platform);
  for (const p of platforms) {
    if (await nextUnusedItem(p)) return;
  }
  if (platforms.length > 0) await buildPlan();
}
