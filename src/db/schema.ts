import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  text: text('text').notNull(),
  topic: text('topic'),
  angle: text('angle'),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => ({
  platformIdx: index('posts_platform_idx').on(t.platform),
  createdIdx: index('posts_created_idx').on(t.createdAt),
}));

export const knowledge = pgTable('knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  content: text('content').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const mentions = pgTable('mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  externalId: text('external_id').notNull(),
  authorHandle: text('author_handle'),
  text: text('text').notNull(),
  inReplyTo: text('in_reply_to'),
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqExt: index('mentions_ext_uniq').on(t.platform, t.externalId),
  statusIdx: index('mentions_status_idx').on(t.status),
}));

export const replies = pgTable('replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  mentionId: uuid('mention_id').references(() => mentions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
});

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  likes: integer('likes').default(0).notNull(),
  reposts: integer('reposts').default(0).notNull(),
  replies: integer('replies').default(0).notNull(),
  impressions: integer('impressions').default(0).notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const planItems = pgTable('plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull(),
  dayOffset: integer('day_offset').notNull(),
  platform: text('platform').notNull(),
  topic: text('topic').notNull(),
  angle: text('angle'),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  planIdx: index('plan_items_plan_idx').on(t.planId),
  unusedIdx: index('plan_items_unused_idx').on(t.used),
}));

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  refType: text('ref_type').notNull(),
  refId: uuid('ref_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  refIdx: index('embeddings_ref_idx').on(t.refType, t.refId),
  vecIdx: index('embeddings_vec_idx').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
}));

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id'),
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number'),
  body: text('body').notNull(),
  direction: text('direction').notNull(),
  respondedBy: text('responded_by'),
  messageTimestamp: timestamp('message_timestamp', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => ({
  uniqExt: index('whatsapp_messages_ext_uniq').on(t.externalId),
  fromIdx: index('whatsapp_messages_from_idx').on(t.fromNumber),
  timeIdx: index('whatsapp_messages_time_idx').on(t.messageTimestamp),
}));

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type Knowledge = typeof knowledge.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
