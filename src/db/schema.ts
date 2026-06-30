import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
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
  email: text('email'),
  lat: text('lat'),
  lng: text('lng'),
  rating: text('rating'),
  summary: text('summary'),
  status: text('status').notNull().default('new'),
  tags: text('tags'),
  emailStatus: text('email_status').notNull().default('unknown'),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  unsubscribeToken: uuid('unsubscribe_token').notNull().defaultRandom(),
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

// ── Embudo de automatizacion (addendum 681 punto 7) ──────────────────
// Un funnel = una regla: cuando un lead llega a trigger_status, se inscribe
// y recibe la secuencia de correos (steps) via Resend, paso a paso.
export type FunnelStep = { delayHours: number; subject: string; body: string };

export const funnels = pgTable('funnels', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  triggerStatus: text('trigger_status').notNull().default('new'),
  enabled: boolean('enabled').notNull().default(true),
  steps: jsonb('steps').$type<FunnelStep[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('funnels_user_idx').on(t.userId),
}));

export const funnelEnrollments = pgTable('funnel_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  funnelId: uuid('funnel_id').notNull().references(() => funnels.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  currentStep: integer('current_step').notNull().default(0),
  status: text('status').notNull().default('active'),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: index('funnel_enrollments_uniq').on(t.funnelId, t.leadId),
  dueIdx: index('funnel_enrollments_due_idx').on(t.status, t.nextRunAt),
}));

// ── Mailing real (tarea 681 — mailer completo) ───────────────────────────
// Plantillas reutilizables (borradores guardados por el usuario).
export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('email_templates_user_idx').on(t.userId, t.updatedAt),
}));

// Una campana = un correo masivo a un segmento de leads. segment define a quien.
export type CampaignSegment =
  | { type: 'all' }
  | { type: 'status'; value: string }
  | { type: 'tag'; value: string }
  | { type: 'manual'; ids: string[] };

export const emailCampaigns = pgTable('email_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull().default(''),
  segment: jsonb('segment').$type<CampaignSegment>().notNull().default(sql`'{"type":"all"}'::jsonb`),
  status: text('status').notNull().default('draft'), // draft|scheduled|sending|sent|failed
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('email_campaigns_user_idx').on(t.userId, t.createdAt),
  dueIdx: index('email_campaigns_due_idx').on(t.status, t.scheduledAt),
}));

export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  funnelId: uuid('funnel_id').references(() => funnels.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => emailCampaigns.id, { onDelete: 'set null' }),
  kind: text('kind').notNull().default('funnel'), // funnel|campaign
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  step: integer('step'),
  provider: text('provider').notNull().default('resend'),
  status: text('status').notNull().default('sent'),
  error: text('error'),
  externalId: text('external_id'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  complainedAt: timestamp('complained_at', { withTimezone: true }),
  openCount: integer('open_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('email_log_user_idx').on(t.userId, t.sentAt),
  campaignIdx: index('email_log_campaign_idx').on(t.campaignId),
  externalIdx: index('email_log_external_idx').on(t.externalId),
}));

// Bitacora cruda de eventos de webhook de Resend (auditoria + idempotencia).
export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id'),
  type: text('type').notNull(),
  toEmail: text('to_email'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  externalIdx: index('email_events_external_idx').on(t.externalId),
  typeIdx: index('email_events_type_idx').on(t.type, t.createdAt),
}));

export type Funnel = typeof funnels.$inferSelect;
export type NewFunnel = typeof funnels.$inferInsert;
export type FunnelEnrollment = typeof funnelEnrollments.$inferSelect;
export type EmailLogRow = typeof emailLog.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type NewEmailCampaign = typeof emailCampaigns.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;

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

// ════════════════════════════════════════════════════════════════════════
// FEATURES INFLUENCER + VENTAS (feat/influencer-features)
// Cada bloque alimenta una feature. uniqueIndex en los slug/code porque son
// la URL publica (vliving.life/oferta/[slug], /ref/[code], etc.).
// ════════════════════════════════════════════════════════════════════════

// (3) OFERTAS FLASH — oferta con countdown, link publico, clicks/conversiones.
export const flashOffers = pgTable('flash_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  price: text('price'),
  currency: text('currency').notNull().default('MXN'),
  destinationUrl: text('destination_url').notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  active: boolean('active').notNull().default(true),
  clickCount: integer('click_count').notNull().default(0),
  conversionCount: integer('conversion_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUniq: uniqueIndex('flash_offers_slug_uniq').on(t.slug),
  userIdx: index('flash_offers_user_idx').on(t.userId, t.createdAt),
}));

// (8) PAGINA DE VENTAS POR CAMPANA — landing publica con formulario de captura.
export const campaignLandings = pgTable('campaign_landings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description'),
  ctaLabel: text('cta_label').notNull().default('Quiero más información'),
  published: boolean('published').notNull().default(true),
  views: integer('views').notNull().default(0),
  submissions: integer('submissions').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUniq: uniqueIndex('campaign_landings_slug_uniq').on(t.slug),
  userIdx: index('campaign_landings_user_idx').on(t.userId, t.createdAt),
}));

// (5) EMBAJADORES GAMIFICADOS — codigo de referido por lead, ranking por nivel.
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name'),
  visits: integer('visits').notNull().default(0),
  leadsGenerated: integer('leads_generated').notNull().default(0),
  salesGenerated: integer('sales_generated').notNull().default(0),
  level: text('level').notNull().default('bronce'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  codeUniq: uniqueIndex('referrals_code_uniq').on(t.code),
  userIdx: index('referrals_user_idx').on(t.userId),
  leadIdx: index('referrals_lead_idx').on(t.leadId),
}));

// (6) STORY LINK INTELIGENTE — un link maestro que redirige por reglas (utm/cookie).
export type StoryRule = { param: string; value: string; url: string };
export const storyLinks = pgTable('story_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  defaultUrl: text('default_url').notNull(),
  rules: jsonb('rules').$type<StoryRule[]>().notNull().default(sql`'[]'::jsonb`),
  clickCount: integer('click_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUniq: uniqueIndex('story_links_slug_uniq').on(t.slug),
  userIdx: index('story_links_user_idx').on(t.userId),
}));

export const linkClicks = pgTable('link_clicks', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyLinkId: uuid('story_link_id').notNull().references(() => storyLinks.id, { onDelete: 'cascade' }),
  matchedUrl: text('matched_url').notNull(),
  utmSource: text('utm_source'),
  utmCampaign: text('utm_campaign'),
  referrer: text('referrer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  linkIdx: index('link_clicks_link_idx').on(t.storyLinkId, t.createdAt),
}));

// (10) CO-CREACION DE PRODUCTOS — votacion publica, votantes quedan como leads.
export type PollOption = { id: string; label: string; description?: string };
export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  question: text('question').notNull(),
  description: text('description'),
  options: jsonb('options').$type<PollOption[]>().notNull().default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('open'), // open|closed
  winnerOptionId: text('winner_option_id'),
  totalVotes: integer('total_votes').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => ({
  slugUniq: uniqueIndex('polls_slug_uniq').on(t.slug),
  userIdx: index('polls_user_idx').on(t.userId),
}));

export const pollVotes = pgTable('poll_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  optionId: text('option_id').notNull(),
  name: text('name'),
  email: text('email').notNull(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pollEmailUniq: uniqueIndex('poll_votes_poll_email_uniq').on(t.pollId, t.email),
  pollIdx: index('poll_votes_poll_idx').on(t.pollId),
}));

// (1) VENTA POR COMENTARIO — reglas de palabra clave -> respuesta + link de pago.
export const commentRules = pgTable('comment_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform').notNull().default('instagram'),
  keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  replyMessage: text('reply_message').notNull(),
  paymentLink: text('payment_link'),
  active: boolean('active').notNull().default(true),
  matchedCount: integer('matched_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('comment_rules_user_idx').on(t.userId),
}));

// (7) HOT LEADS — senales de compra acumuladas por lead; al pasar umbral, alerta WA.
export const leadSignals = pgTable('lead_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // email_open|email_click|referral_visit|landing|vote|comment
  weight: integer('weight').notNull().default(1),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  leadIdx: index('lead_signals_lead_idx').on(t.leadId),
  userIdx: index('lead_signals_user_idx').on(t.userId, t.createdAt),
}));

// (4) SUSCRIPCIONES / MEMBRESIAS — planes VIP; link de WhatsApp para cierre manual.
export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  price: text('price').notNull(),
  currency: text('currency').notNull().default('MXN'),
  interval: text('interval').notNull().default('mensual'),
  benefits: jsonb('benefits').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  whatsappNumber: text('whatsapp_number'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('membership_plans_user_idx').on(t.userId),
}));

export type FlashOffer = typeof flashOffers.$inferSelect;
export type NewFlashOffer = typeof flashOffers.$inferInsert;
export type CampaignLanding = typeof campaignLandings.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type StoryLink = typeof storyLinks.$inferSelect;
export type LinkClick = typeof linkClicks.$inferSelect;
export type Poll = typeof polls.$inferSelect;
export type PollVote = typeof pollVotes.$inferSelect;
export type CommentRule = typeof commentRules.$inferSelect;
export type LeadSignal = typeof leadSignals.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
