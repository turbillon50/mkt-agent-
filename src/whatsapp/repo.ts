import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { whatsappMessages, type NewWhatsappMessage, type WhatsappMessage } from '../db/schema';

export async function insertMessage(input: NewWhatsappMessage): Promise<WhatsappMessage> {
  const [row] = await db.insert(whatsappMessages).values(input).returning();
  if (!row) throw new Error('Failed to persist whatsapp message.');
  return row;
}

export async function upsertInbound(input: NewWhatsappMessage): Promise<WhatsappMessage | null> {
  if (!input.externalId) {
    return insertMessage(input);
  }
  const existing = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.externalId, input.externalId))
    .limit(1);
  if (existing.length > 0) return existing[0] ?? null;
  return insertMessage(input);
}

export async function listConversations(limit = 50) {
  return db
    .select({
      fromNumber: whatsappMessages.fromNumber,
      lastBody: sql<string>`(array_agg(${whatsappMessages.body} ORDER BY ${whatsappMessages.messageTimestamp} DESC))[1]`,
      lastAt: sql<Date>`max(${whatsappMessages.messageTimestamp})`,
      messages: sql<number>`count(*)::int`,
    })
    .from(whatsappMessages)
    .groupBy(whatsappMessages.fromNumber)
    .orderBy(sql`max(${whatsappMessages.messageTimestamp}) DESC`)
    .limit(limit);
}

export async function listMessagesFor(number: string, limit = 200) {
  return db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.fromNumber, number))
    .orderBy(whatsappMessages.messageTimestamp)
    .limit(limit);
}

export async function listRecentMessages(limit = 50) {
  return db
    .select()
    .from(whatsappMessages)
    .orderBy(desc(whatsappMessages.messageTimestamp))
    .limit(limit);
}
