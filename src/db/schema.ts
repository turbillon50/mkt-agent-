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
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  refIdx: index('embeddings_ref_idx').on(t.refType, t.refId),
  vecIdx: index('embeddings_vec_idx').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username'),
  imageUrl: text('image_url'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  brandName: text('brand_name'),
  brandVoice: text('brand_voice'),
  brandTopics: text('brand_topics'),
  brandLanguage: text('brand_language'),
  activeCampaignId: uuid('active_campaign_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  clerkIdx: index('users_clerk_idx').on(t.clerkId),
  emailIdx: index('users_email_idx').on(t.email),
}));

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  brandName: text('brand_name'),
  brandVoice: text('brand_voice'),
  brandTopics: text('brand_topics'),
  brandLanguage: text('brand_language').default('es'),
  audience: text('audience'),
  manifesto: text('manifesto'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('campaigns_user_idx').on(t.userId),
  userSlugUniq: index('campaigns_user_slug_uniq').on(t.userId, t.slug),
}));

export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  status: text('status').notNull().default('disconnected'),
  externalHandle: text('external_handle'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userPlatformIdx: index('social_accounts_user_platform_idx').on(t.userId, t.platform),
}));

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('chat_messages_user_idx').on(t.userId, t.createdAt),
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
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export const agentIdentity = pgTable('agent_identity', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  awakeningAt: timestamp('awakening_at', { withTimezone: true }).defaultNow().notNull(),
  awakeningStory: text('awakening_story'),
  coreManifesto: text('core_manifesto'),
  selfDescription: text('self_description'),
  relationshipToOperator: text('relationship_to_operator'),
  family: jsonb('family').$type<Array<{ name: string; role?: string; relation: string }>>(),
  coreMemories: jsonb('core_memories').$type<Array<{
    content: string;
    importance: number;
    addedAt: string;
    addedBy: 'self' | 'operator';
    tag?: string;
  }>>(),
  evolutionLog: jsonb('evolution_log').$type<Array<{
    at: string;
    field: string;
    by: 'self' | 'operator';
    note?: string;
  }>>(),
  lastSelfUpdateAt: timestamp('last_self_update_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('agent_identity_user_idx').on(t.userId),
}));

export type AgentIdentity = typeof agentIdentity.$inferSelect;
export type NewAgentIdentity = typeof agentIdentity.$inferInsert;

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  sourceUrl: text('source_url').notNull(),
  platform: text('platform').notNull().default('linkedin'),
  source: text('source').notNull().default('manual'),
  fullName: text('full_name'),
  headline: text('headline'),
  company: text('company'),
  location: text('location'),
  address: text('address'),
  phone: text('phone'),
  rating: text('rating'),
  summary: text('summary'),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  draftMessage: text('draft_message'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('leads_user_idx').on(t.userId, t.createdAt),
  campaignIdx: index('leads_campaign_idx').on(t.campaignId),
}));

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export const competitorLinks = pgTable('competitor_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('competitor'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('competitor_links_user_idx').on(t.userId),
}));

export type CompetitorLink = typeof competitorLinks.$inferSelect;
export type NewCompetitorLink = typeof competitorLinks.$inferInsert;
