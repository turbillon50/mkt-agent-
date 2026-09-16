-- Goossip Social OS: fuentes con autoridad y recibos de publicación.
-- Solo agrega; no borra ni transforma datos existentes.

CREATE TABLE IF NOT EXISTS "knowledge_sources" (
  "id" text PRIMARY KEY,
  "platform" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "authority" integer NOT NULL DEFAULT 100,
  "version" text,
  "fetched_at" timestamptz,
  "valid_until" timestamptz,
  "source_hash" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_sources_platform_idx"
  ON "knowledge_sources" ("platform", "kind");
CREATE INDEX IF NOT EXISTS "knowledge_sources_freshness_idx"
  ON "knowledge_sources" ("valid_until");

CREATE TABLE IF NOT EXISTS "publication_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "piece_id" uuid REFERENCES "creative_pieces"("id") ON DELETE SET NULL,
  "post_id" uuid REFERENCES "posts"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'started',
  "stage" text NOT NULL DEFAULT 'preflight',
  "account_handle" text,
  "account_external_id" text,
  "external_id" text,
  "external_url" text,
  "provider_code" text,
  "request_id" text,
  "error_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "publication_attempts_project_idx"
  ON "publication_attempts" ("project_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "publication_attempts_status_idx"
  ON "publication_attempts" ("status", "started_at" DESC);
