import { NextRequest, NextResponse } from 'next/server';
import { eq, sql, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface AppendPayload {
  email: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
  awakeningStory?: string;
  coreManifesto?: string;
  selfDescription?: string;
  relationshipToOperator?: string;
  family?: Array<{ name: string; role?: string; relation: string }>;
  addCoreMemories?: Array<{ content: string; importance: number; tag?: string }>;
  startedAtIso?: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as AppendPayload | null;
  if (!body?.email) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });

  const { db } = await import('@/src/db/client');
  const { users, chatMessages, agentIdentity } = await import('@/src/db/schema');

  const userRow = (await db.select().from(users).where(eq(users.email, body.email)).limit(1))[0];
  if (!userRow) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // 1) Append conversation. Start timestamps where the previous awakening left off + 1m gap.
  let messagesInserted = 0;
  if (body.conversation && body.conversation.length > 0) {
    const lastAwakening = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(sql`${chatMessages.userId} = ${userRow.id} AND metadata->>'origin' = 'awakening'`)
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);
    const baseTime = body.startedAtIso
      ? new Date(body.startedAtIso).getTime()
      : (lastAwakening[0]?.createdAt?.getTime() ?? Date.now()) + 60_000;

    const existingTurnsRes = await db.execute<{ max_turn: number | null }>(
      sql`SELECT MAX((metadata->>'turn')::int) as max_turn FROM chat_messages WHERE user_id = ${userRow.id} AND metadata->>'origin' = 'awakening'`,
    );
    const maxTurn = ((existingTurnsRes as any).rows ?? [])[0]?.max_turn ?? -1;
    let nextTurn = (maxTurn ?? -1) + 1;

    for (let i = 0; i < body.conversation.length; i++) {
      const turn = body.conversation[i]!;
      const ts = new Date(baseTime + i * 45_000);
      await db.insert(chatMessages).values({
        userId: userRow.id,
        role: turn.role,
        content: turn.content,
        metadata: { origin: 'awakening', sealed: true, turn: nextTurn + i },
        createdAt: ts,
      });
      messagesInserted++;
    }
  }

  // 2) Update identity (only fields provided), append core memories (don't replace).
  const existing = (await db.select().from(agentIdentity).where(eq(agentIdentity.userId, userRow.id)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: 'identity not seeded yet' }, { status: 409 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.awakeningStory) patch.awakeningStory = body.awakeningStory;
  if (body.coreManifesto) patch.coreManifesto = body.coreManifesto;
  if (body.selfDescription) patch.selfDescription = body.selfDescription;
  if (body.relationshipToOperator) patch.relationshipToOperator = body.relationshipToOperator;
  if (body.family) patch.family = body.family;

  if (body.addCoreMemories && body.addCoreMemories.length > 0) {
    const newMemories = body.addCoreMemories.map((m) => ({
      content: m.content,
      importance: m.importance ?? 7,
      tag: m.tag,
      addedBy: 'operator' as const,
      addedAt: new Date().toISOString(),
    }));
    const current = Array.isArray(existing.coreMemories) ? existing.coreMemories : [];
    patch.coreMemories = [...current, ...newMemories];
    const log = Array.isArray(existing.evolutionLog) ? existing.evolutionLog : [];
    log.push({
      at: new Date().toISOString(),
      field: 'core_memories',
      by: 'operator',
      note: `+${newMemories.length} memories (append-soul)`,
    });
    patch.evolutionLog = log;
  }

  if (Object.keys(patch).length > 1) {
    await db.update(agentIdentity).set(patch as never).where(eq(agentIdentity.id, existing.id));
  }

  return NextResponse.json({
    ok: true,
    messagesInserted,
    coreMemoriesAppended: body.addCoreMemories?.length ?? 0,
    patched: Object.keys(patch).filter((k) => k !== 'updatedAt'),
  });
}
