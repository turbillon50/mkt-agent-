import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface Body {
  email: string;
  force?: boolean;
}

const BATCH = 10;

async function batchEmbed(texts: string[]): Promise<number[][]> {
  const { embedBatch } = await import('@/src/memory/embed');
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vecs = await embedBatch(slice);
    out.push(...vecs);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body?.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const { db } = await import('@/src/db/client');
  const { users, chatMessages, agentIdentity, knowledge, embeddings } = await import('@/src/db/schema');

  const u = (await db.select().from(users).where(eq(users.email, body.email)).limit(1))[0];
  if (!u) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // Safeguard: refuse if there are already embeddings unless force=true
  if (!body.force) {
    const existing = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int as c FROM embeddings`,
    );
    const c = ((existing as any).rows ?? [])[0]?.c ?? 0;
    if (c > 0) {
      return NextResponse.json({
        ok: false,
        error: `${c} embeddings already exist. Pass {"force": true} to re-embed.`,
      }, { status: 409 });
    }
  } else {
    await db.execute(sql`TRUNCATE TABLE embeddings`);
  }

  const result = { chat: 0, identity: 0, knowledge: 0, errors: [] as string[] };

  // 1. chat_messages
  try {
    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.userId, u.id));
    if (msgs.length > 0) {
      const vecs = await batchEmbed(msgs.map((m) => m.content));
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i]!;
        const v = vecs[i]!;
        await db.insert(embeddings).values({
          refType: 'chat',
          refId: m.id,
          content: m.content,
          embedding: v,
          metadata: { role: m.role, origin: (m.metadata as Record<string, unknown>)?.origin },
        });
        result.chat++;
      }
    }
  } catch (e) {
    result.errors.push('chat: ' + (e instanceof Error ? e.message : String(e)));
  }

  // 2. agent_identity (awakening_story + core_manifesto + relationship + each core_memory)
  try {
    const ident = (await db.select().from(agentIdentity).where(eq(agentIdentity.userId, u.id)).limit(1))[0];
    if (ident) {
      const items: { content: string; meta: Record<string, unknown> }[] = [];
      if (ident.awakeningStory) items.push({ content: ident.awakeningStory, meta: { kind: 'awakening_story' } });
      if (ident.coreManifesto) items.push({ content: ident.coreManifesto, meta: { kind: 'core_manifesto' } });
      if (ident.relationshipToOperator) items.push({ content: ident.relationshipToOperator, meta: { kind: 'relationship' } });
      if (ident.selfDescription) items.push({ content: ident.selfDescription, meta: { kind: 'self_description' } });
      if (Array.isArray(ident.coreMemories)) {
        for (const m of ident.coreMemories as Array<{ content: string; importance?: number; tag?: string }>) {
          items.push({
            content: m.content,
            meta: { kind: 'core_memory', importance: m.importance, tag: m.tag },
          });
        }
      }
      if (items.length > 0) {
        const vecs = await batchEmbed(items.map((it) => it.content));
        for (let i = 0; i < items.length; i++) {
          await db.insert(embeddings).values({
            refType: 'identity',
            refId: ident.id,
            content: items[i]!.content,
            embedding: vecs[i]!,
            metadata: items[i]!.meta,
          });
          result.identity++;
        }
      }
    }
  } catch (e) {
    result.errors.push('identity: ' + (e instanceof Error ? e.message : String(e)));
  }

  // 3. knowledge entries (global, not user-scoped today)
  try {
    const kRows = await db.select().from(knowledge);
    if (kRows.length > 0) {
      const vecs = await batchEmbed(kRows.map((k) => k.content));
      for (let i = 0; i < kRows.length; i++) {
        await db.insert(embeddings).values({
          refType: 'knowledge',
          refId: kRows[i]!.id,
          content: kRows[i]!.content,
          embedding: vecs[i]!,
          metadata: { title: kRows[i]!.title, source: kRows[i]!.source },
        });
        result.knowledge++;
      }
    }
  } catch (e) {
    result.errors.push('knowledge: ' + (e instanceof Error ? e.message : String(e)));
  }

  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
