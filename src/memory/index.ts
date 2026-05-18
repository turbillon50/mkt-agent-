import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { embeddings } from '../db/schema';
import { embed } from './embed';
import { config } from '../config';

export type MemoryRefType = 'post' | 'knowledge' | 'mention' | 'reply' | 'whatsapp' | 'chat' | 'identity';

export interface RecallHit {
  id: string;
  refType: MemoryRefType;
  refId: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

/**
 * remember() persists a semantic memory entry. When embeddings are disabled
 * (config.embeddings.enabled === false) this is a no-op — the source row
 * still lives in its own table, just without a vector for similarity search.
 */
export async function remember(params: {
  refType: MemoryRefType;
  refId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!config.embeddings.enabled) return;
  const vec = await embed(params.content);
  await db.insert(embeddings).values({
    refType: params.refType,
    refId: params.refId,
    content: params.content,
    embedding: vec,
    metadata: params.metadata ?? null,
  });
}

/**
 * recall() returns top-k semantically similar memories. When embeddings are
 * disabled, falls back to a case-insensitive substring match on `content`
 * — slower and less smart but works with zero extra providers.
 */
export async function recall(
  query: string,
  opts: { k?: number; minSimilarity?: number; refType?: MemoryRefType } = {},
): Promise<RecallHit[]> {
  const k = opts.k ?? config.memory.recallK;

  if (!config.embeddings.enabled) {
    const tokens = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .slice(0, 4);
    if (tokens.length === 0) return [];

    const rows = await db.execute<{
      id: string;
      ref_type: MemoryRefType;
      ref_id: string;
      content: string;
      metadata: Record<string, unknown> | null;
    }>(sql`
      SELECT id, ref_type, ref_id, content, metadata
      FROM embeddings
      ${opts.refType ? sql`WHERE ref_type = ${opts.refType} AND` : sql`WHERE`}
        ${sql.join(
          tokens.map((t) => sql`content ILIKE ${'%' + t + '%'}`),
          sql` OR `,
        )}
      ORDER BY created_at DESC
      LIMIT ${k}
    `).catch(() => ({ rows: [] as any[] }));
    return ((rows as any).rows ?? []).map((r: any) => ({
      id: r.id,
      refType: r.ref_type,
      refId: r.ref_id,
      content: r.content,
      similarity: 0,
      metadata: r.metadata,
    }));
  }

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
