CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "source_url" text NOT NULL,
  "platform" text NOT NULL DEFAULT 'linkedin',
  "full_name" text,
  "headline" text,
  "company" text,
  "location" text,
  "summary" text,
  "status" text NOT NULL DEFAULT 'new',
  "notes" text,
  "raw" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "leads_user_idx" ON "leads" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "leads_campaign_idx" ON "leads" ("campaign_id");
CREATE UNIQUE INDEX IF NOT EXISTS "leads_user_url_uniq" ON "leads" ("user_id", "source_url");

CREATE TABLE IF NOT EXISTS "competitor_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'competitor',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "competitor_links_user_idx" ON "competitor_links" ("user_id");
