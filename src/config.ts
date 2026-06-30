import 'dotenv/config';

const truthy = (v: unknown) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

/**
 * Tiered model strategy. Defaults bias toward cheap / free models for the
 * routine work (post drafting, auto-replies) and reserve the heavy model
 * for the tool-calling agent and the weekly plan, where reasoning quality
 * actually changes the outcome.
 *
 * Every job is overridable via env so you can swap providers without code.
 *
 * PROVEEDOR: por default usamos el Mesh Router propio de Luis (Cerebras +
 * GPUs propias, expuesto en api.mindcontextia.one/mesh) en vez de pagar
 * OpenRouter. Es un endpoint OpenAI-compatible real (/v1/chat/completions),
 * asi que basta con apuntar baseUrl + apiKey ahi. Si algo falla, LLM_PROVIDER=
 * openrouter regresa al proveedor anterior sin tocar codigo.
 */
const provider = (process.env.LLM_PROVIDER || 'mesh').toLowerCase();
const isMesh = provider === 'mesh';

// gpt-oss-120b es un modelo "razonador": gasta tokens pensando antes de
// contestar. Con max_tokens bajo se queda a medias (content vacio,
// finish_reason length). 800 es el piso seguro para que siempre alcance
// a terminar de razonar y dar el contenido real.
const MESH_DEFAULT_MAX_TOKENS = 800;

export const config = {
  openrouter: {
    apiKey: isMesh
      ? (process.env.MESH_API_KEY ?? '')
      : (process.env.OPENROUTER_API_KEY ?? ''),
    baseUrl: isMesh
      ? (process.env.MESH_BASE_URL || 'https://api.mindcontextia.one/mesh/v1')
      : (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'),

    // Tier A — heavy reasoning (Mastra agent main loop, weekly plan).
    modelAgent: isMesh
      ? (process.env.MESH_MODEL_AGENT || process.env.MESH_MODEL || 'gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL_AGENT || 'anthropic/claude-sonnet-4-5'),
    modelPlan: isMesh
      ? (process.env.MESH_MODEL_PLAN || process.env.MESH_MODEL || 'gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL_PLAN || 'anthropic/claude-sonnet-4-5'),

    // Tier B — fast & cheap drafting (single post generation).
    modelDraft: isMesh
      ? (process.env.MESH_MODEL_DRAFT || process.env.MESH_MODEL || 'gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL_DRAFT || 'google/gemini-2.5-flash'),

    // Tier C — free fast replies (WhatsApp auto-reply, ad-hoc lightweight tasks).
    modelReply: isMesh
      ? (process.env.MESH_MODEL_REPLY || process.env.MESH_MODEL || 'gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL_REPLY || 'google/gemini-2.5-flash-lite'),

    // Legacy single-model knob kept for backwards compat with `openrouter.ts`.
    model: isMesh
      ? (process.env.MESH_MODEL || 'gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL_DRAFT || 'google/gemini-2.5-flash'),

    // Piso de max_tokens para que el modelo razonador alcance a responder.
    minMaxTokens: isMesh ? MESH_DEFAULT_MAX_TOKENS : 0,

    provider: isMesh ? ('mesh' as const) : ('openrouter' as const),
  },
  embeddings: {
    // Semantic memory is opt-in. With it OFF, recall() returns [] and the
    // agent still works fine — it just won't do similarity-based dedup.
    // Turn ON by setting EMBEDDINGS_ENABLED=true and pointing to any
    // OpenAI-compatible /embeddings endpoint (Jina, Voyage, Cohere, etc.).
    enabled: truthy(process.env.EMBEDDINGS_ENABLED ?? 'false'),
    apiKey: process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.EMBEDDINGS_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.EMBEDDINGS_MODEL || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: Number(process.env.EMBEDDINGS_DIMENSIONS ?? 1024),
  },
  db: {
    url: process.env.DATABASE_URL ?? '',
  },
  brand: {
    name: process.env.BRAND_NAME || 'My Brand',
    voice: process.env.BRAND_VOICE || 'friendly, concise, expert',
    topics: (process.env.BRAND_TOPICS || 'marketing,automation,ai')
      .split(',').map((s) => s.trim()).filter(Boolean),
    language: process.env.BRAND_LANGUAGE || 'en',
  },
  schedule: {
    postCron: process.env.POST_CRON || '0 9,18 * * *',
    planCron: process.env.PLAN_CRON || '0 8 * * 1',
    timezone: process.env.TIMEZONE || 'UTC',
  },
  twitter: {
    enabled: truthy(process.env.TWITTER_ENABLED),
    appKey: process.env.TWITTER_APP_KEY ?? '',
    appSecret: process.env.TWITTER_APP_SECRET ?? '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN ?? '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET ?? '',
  },
  linkedin: {
    enabled: truthy(process.env.LINKEDIN_ENABLED),
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN ?? '',
    authorUrn: process.env.LINKEDIN_AUTHOR_URN ?? '',
  },
  memory: {
    recallK: Number(process.env.MEMORY_RECALL_K ?? 5),
    minSimilarity: Number(process.env.MEMORY_MIN_SIMILARITY ?? 0.78),
  },
  whatsapp: {
    enabled: truthy(process.env.WHATSAPP_ENABLED),
    autoReply: truthy(process.env.WHATSAPP_AUTO_REPLY),
    bridgeUrl: process.env.WHATSAPP_BRIDGE_URL ?? '',
    bridgeSecret: process.env.WHATSAPP_BRIDGE_SECRET ?? '',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '',
  },
} as const;

export type Platform = 'twitter' | 'linkedin';
