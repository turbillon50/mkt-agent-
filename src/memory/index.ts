import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { embeddings } from '../db/schema.js';
import { embed } from './embed.js';
import { config } from '../config.js';

export type MemoryRefType = 'post' | 'knowledge' | 'mention' | 'reply';

export interface RecallHit {
  id: string;
  refType: MemoryRefType;
  refId: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

export async function remember(params: {
  refType: MemoryRefType;
  refId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const vec = await embed(params.content);
  await db.insert(embeddings).values({
    refType: params.refType,
    refId: params.refId,
    content: params.content,
    embedding: vec,
    metadata: params.metadata ?? null,
  });
}

export async function recall(
  query: string,
  opts: { k?: number; minSimilarity?: number; refType?: MemoryRefType } = {},
): Promise<RecallHit[]> {
  const k = opts.k ?? config.memory.recallK;
  const minSim = opts.minSimilarity ?? config.memory.minSimilarity;
  const vec = await embed(query);
  const literal = `[${vec.join(',')}]`;

  const rows = await db.execute<{
    id: string;
    ref_type: MemoryRefType;
    ref_id: string;
    content: string;
    similarity: number;
    metadata: Record<string, unknown> | null;
  }>(sql`
    SELECT id,
           ref_type,
           ref_id,
           content,
           metadata,
           1 - (embedding <=> ${literal}::vector) AS similarity
    FROM embeddings
    ${opts.refType ? sql`WHERE ref_type = ${opts.refType}` : sql``}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${k}
  `);

  return (rows.rows ?? rows as unknown as any[])
    .map((r: any) => ({
      id: r.id,
      refType: r.ref_type,
      refId: r.ref_id,
      content: r.content,
      similarity: Number(r.similarity),
      metadata: r.metadata,
    }))
    .filter((h: RecallHit) => h.similarity >= minSim);
}
