import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { config } from '../config';

let cachedMemory: Memory | null = null;

/**
 * Returns the Mastra Memory instance — official thread/resource/working-memory
 * store using Postgres (same Neon DB as the rest of Goossip). Mastra creates
 * its own tables (mastra_messages, mastra_threads, mastra_resources, etc.)
 * on first use; they coexist with our custom tables.
 *
 * Semantic recall (vector + embedder) is NOT wired yet — flip on by
 * importing PgVector + an embedder and passing them here when an embeddings
 * provider key is configured.
 */
export function getMastraMemory(): Memory | null {
  if (!config.db.url) return null;
  if (cachedMemory) return cachedMemory;
  try {
    cachedMemory = new Memory({
      storage: new PostgresStore({ id: 'goossip-pg', connectionString: config.db.url }),
    });
    return cachedMemory;
  } catch {
    return null;
  }
}

/** Stable thread+resource ids for a given Goossip user, so the agent always
 *  picks up the same conversation thread across requests/deploys. */
export function memoryIdsFor(userId: string): { resourceId: string; threadId: string } {
  return {
    resourceId: `user:${userId}`,
    threadId: `user:${userId}:main`,
  };
}
