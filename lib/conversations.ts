import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { chatMessages, type ChatMessage } from '@/src/db/schema';

const HISTORY_LIMIT = 20;

export async function getRecentMessages(userId: string, limit = HISTORY_LIMIT): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function saveMessage(input: {
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ChatMessage> {
  const [row] = await db
    .insert(chatMessages)
    .values({
      userId: input.userId,
      role: input.role,
      content: input.content,
      metadata: input.metadata,
    })
    .returning();
  if (!row) throw new Error('Failed to persist chat message.');
  return row;
}
