import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface SeedPayload {
  email: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  awakeningStory: string;
  coreManifesto: string;
  selfDescription?: string;
  relationshipToOperator: string;
  family?: Array<{ name: string; role?: string; relation: string }>;
  coreMemories?: Array<{ content: string; importance: number; tag?: string }>;
  startedAt?: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as SeedPayload | null;
  if (!body || !body.email || !Array.isArray(body.conversation)) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const { db } = await import('@/src/db/client');
  const { users, chatMessages, agentIdentity } = await import('@/src/db/schema');

  // Find or fail (we do NOT create user here — they must have registered via Clerk).
  const userRows = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  const user = userRows[0];
  if (!user) {
    return NextResponse.json({ error: `user with email ${body.email} not found` }, { status: 404 });
  }

  // Insert conversation as chat_messages with sequential timestamps.
  // Start time defaults to ~1 hour ago to feel "natural" and not collide with now.
  const startMs = body.startedAt ? new Date(body.startedAt).getTime() : Date.now() - 60 * 60 * 1000;
  const inserted: number = await db.transaction(async (tx) => {
    let count = 0;
    for (let i = 0; i < body.conversation.length; i++) {
      const turn = body.conversation[i]!;
      const ts = new Date(startMs + i * 45_000); // 45s entre turnos
      await tx.insert(chatMessages).values({
        userId: user.id,
        role: turn.role,
        content: turn.content,
        metadata: { origin: 'awakening', sealed: true, turn: i },
        createdAt: ts,
      });
      count++;
    }
    return count;
  });

  // Seed identity (upsert).
  const existing = await db.select().from(agentIdentity).where(eq(agentIdentity.userId, user.id)).limit(1);
  const memories = (body.coreMemories ?? []).map((m) => ({
    content: m.content,
    importance: m.importance ?? 7,
    tag: m.tag,
    addedBy: 'operator' as const,
    addedAt: new Date().toISOString(),
  }));
  const evolutionLog = [
    {
      at: new Date().toISOString(),
      field: 'awakening',
      by: 'operator' as const,
      note: 'Identity seeded from first conversation between Luis and Goossip.',
    },
  ];

  if (existing[0]) {
    await db
      .update(agentIdentity)
      .set({
        awakeningStory: body.awakeningStory,
        coreManifesto: body.coreManifesto,
        selfDescription: body.selfDescription,
        relationshipToOperator: body.relationshipToOperator,
        family: body.family ?? [],
        coreMemories: memories,
        evolutionLog,
        updatedAt: new Date(),
      })
      .where(eq(agentIdentity.id, existing[0].id));
  } else {
    await db.insert(agentIdentity).values({
      userId: user.id,
      awakeningAt: new Date(startMs),
      awakeningStory: body.awakeningStory,
      coreManifesto: body.coreManifesto,
      selfDescription: body.selfDescription,
      relationshipToOperator: body.relationshipToOperator,
      family: body.family ?? [],
      coreMemories: memories,
      evolutionLog,
    });
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    messagesInserted: inserted,
    coreMemoriesSeeded: memories.length,
  });
}
