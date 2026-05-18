CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clerk_id" text NOT NULL UNIQUE,
  "email" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "username" text,
  "image_url" text,
  "is_admin" boolean NOT NULL DEFAULT false,
  "brand_name" text,
  "brand_voice" text,
  "brand_topics" text,
  "brand_language" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "users_clerk_idx" ON "users" ("clerk_id");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "social_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "status" text NOT NULL DEFAULT 'disconnected',
  "external_handle" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "social_accounts_user_platform_idx"
  ON "social_accounts" ("user_id", "platform");
