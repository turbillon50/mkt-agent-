-- Goossip corrida 1 — agencia + super vendedor multi-proyecto.
--
-- NOTA DE NUMERACIÓN: el issue pedía "0010", pero 0010_automations_funnels.sql
-- y 0011_mailing.sql ya están aplicados en la base de producción (vienen de
-- feat/pwa-maps-crm-chat-composio y feat/mailing-inteligente). El runner
-- (src/db/migrate.ts) ordena por nombre de archivo, así que reusar 0010 dejaría
-- esta migración corriendo ANTES que las ya aplicadas. Va como 0012.
--
-- `campaigns` sigue siendo la tabla; en UI y tipos se llama PROYECTO.

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'servicios';
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "channels" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "seller_persona" text;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "rules" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "mcp_sources" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Resolución del proyecto desde un webhook: por page_id, por form_id o por
-- phone_number_id de WABA. Sin índice esto es un seq scan por cada evento.
CREATE INDEX IF NOT EXISTS "campaigns_channels_gin" ON "campaigns" USING gin ("channels" jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- sales_leads — leads de VENTA (Meta leadgen, sitio, manual, import).
-- NO se toca `leads`, que es la tabla de prospección de LinkedIn/Maps.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sales_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "phone" text,
  "email" text,
  "full_name" text,
  "source" text NOT NULL DEFAULT 'manual',
  "source_ref" text,
  "score" integer NOT NULL DEFAULT 0,
  "grade" text NOT NULL DEFAULT 'C',
  "score_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "stage" text NOT NULL DEFAULT 'nuevo',
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "interest" jsonb,
  "phone_validation" jsonb,
  "raw" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Un teléfono no se repite dentro del mismo proyecto; entre proyectos sí puede.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_leads_campaign_phone_uniq"
  ON "sales_leads" ("campaign_id", "phone")
  WHERE "phone" IS NOT NULL;
-- El mismo lead de Meta no entra dos veces aunque el webhook se reintente.
CREATE UNIQUE INDEX IF NOT EXISTS "sales_leads_campaign_source_ref_uniq"
  ON "sales_leads" ("campaign_id", "source", "source_ref")
  WHERE "source_ref" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "sales_leads_campaign_stage_idx" ON "sales_leads" ("campaign_id", "stage");
CREATE INDEX IF NOT EXISTS "sales_leads_campaign_created_idx" ON "sales_leads" ("campaign_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "sales_leads_phone_idx" ON "sales_leads" ("phone");
CREATE INDEX IF NOT EXISTS "sales_leads_user_idx" ON "sales_leads" ("user_id");

-- ---------------------------------------------------------------------------
-- sales_lead_events — bitácora. Cada movimiento con timestamp y actor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sales_lead_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "from_stage" text,
  "to_stage" text,
  "actor" text NOT NULL DEFAULT 'goossip',
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_lead_events_lead_idx" ON "sales_lead_events" ("lead_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- conversations — un hilo por (proyecto, canal, contraparte).
-- campaign_id es NULLABLE a propósito: los whatsapp_messages heredados de
-- Baileys no traen proyecto y aun así se conservan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "lead_id" uuid REFERENCES "sales_leads"("id") ON DELETE SET NULL,
  "channel" text NOT NULL DEFAULT 'whatsapp',
  "external_thread_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "last_inbound_at" timestamptz,
  "last_outbound_at" timestamptz,
  "window_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Índice parcial + índice para los legacy sin proyecto: en Postgres un NULL en
-- campaign_id no choca consigo mismo en un UNIQUE normal, por eso van dos.
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_thread_uniq"
  ON "conversations" ("campaign_id", "channel", "external_thread_id")
  WHERE "campaign_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_thread_orphan_uniq"
  ON "conversations" ("channel", "external_thread_id")
  WHERE "campaign_id" IS NULL;
CREATE INDEX IF NOT EXISTS "conversations_lead_idx" ON "conversations" ("lead_id");
CREATE INDEX IF NOT EXISTS "conversations_campaign_status_idx" ON "conversations" ("campaign_id", "status");

-- ---------------------------------------------------------------------------
-- messages — mensajes de la conversación (WhatsApp Cloud API, SMS, email).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "media" jsonb,
  "template_name" text,
  "external_id" text,
  "delivery_status" text,
  "responded_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_external_uniq"
  ON "messages" ("external_id")
  WHERE "external_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" ("conversation_id", "created_at");

-- ---------------------------------------------------------------------------
-- action_queue — todo lo que Goossip quiere hacer pasa por aquí.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "action_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "lead_id" uuid REFERENCES "sales_leads"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priority" integer NOT NULL DEFAULT 5,
  "status" text NOT NULL DEFAULT 'pending',
  "reason" text,
  "scheduled_for" timestamptz NOT NULL DEFAULT now(),
  "executed_at" timestamptz,
  "result" jsonb,
  "created_by" text NOT NULL DEFAULT 'goossip',
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "action_queue_campaign_status_idx" ON "action_queue" ("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "action_queue_runner_idx" ON "action_queue" ("status", "scheduled_for", "priority");
CREATE INDEX IF NOT EXISTS "action_queue_lead_idx" ON "action_queue" ("lead_id");

-- Una regla no encola dos veces lo mismo para el mismo lead mientras sigue
-- esperando: sin esto el cron de cada minuto haría cola infinita.
CREATE UNIQUE INDEX IF NOT EXISTS "action_queue_pending_rule_uniq"
  ON "action_queue" ("lead_id", "kind", "created_by")
  WHERE "lead_id" IS NOT NULL AND "status" IN ('pending', 'approved', 'auto');

-- ---------------------------------------------------------------------------
-- Migración de whatsapp_messages -> conversations/messages, lead_id NULL.
-- Idempotente: se apoya en messages_external_uniq y en el thread único.
-- ---------------------------------------------------------------------------
INSERT INTO "conversations" ("campaign_id", "lead_id", "channel", "external_thread_id", "status", "last_inbound_at", "last_outbound_at")
SELECT
  w."campaign_id",
  NULL,
  'whatsapp',
  w."from_number",
  'closed',
  max(w."message_timestamp") FILTER (WHERE w."direction" = 'inbound'),
  max(w."message_timestamp") FILTER (WHERE w."direction" = 'outbound')
FROM "whatsapp_messages" w
WHERE NOT EXISTS (
  SELECT 1 FROM "conversations" c
  WHERE c."channel" = 'whatsapp'
    AND c."external_thread_id" = w."from_number"
    AND c."campaign_id" IS NOT DISTINCT FROM w."campaign_id"
)
GROUP BY w."campaign_id", w."from_number";

INSERT INTO "messages" ("conversation_id", "direction", "body", "template_name", "external_id", "delivery_status", "responded_by", "created_at")
SELECT
  c."id",
  w."direction",
  w."body",
  NULL,
  w."external_id",
  CASE WHEN w."direction" = 'outbound' THEN 'sent' ELSE NULL END,
  w."responded_by",
  w."message_timestamp"
FROM "whatsapp_messages" w
JOIN "conversations" c
  ON c."channel" = 'whatsapp'
 AND c."external_thread_id" = w."from_number"
 AND c."campaign_id" IS NOT DISTINCT FROM w."campaign_id"
ON CONFLICT DO NOTHING;
