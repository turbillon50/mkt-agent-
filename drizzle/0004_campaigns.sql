CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "brand_name" text,
  "brand_voice" text,
  "brand_topics" text,
  "brand_language" text DEFAULT 'es',
  "audience" text,
  "manifesto" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "campaigns_user_idx" ON "campaigns" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_user_slug_uniq" ON "campaigns" ("user_id", "slug");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "knowledge" ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;
