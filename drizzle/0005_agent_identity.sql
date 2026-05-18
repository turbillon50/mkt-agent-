CREATE TABLE IF NOT EXISTS "agent_identity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "awakening_at" timestamptz NOT NULL DEFAULT now(),
  "awakening_story" text,
  "core_manifesto" text,
  "self_description" text,
  "relationship_to_operator" text,
  "family" jsonb,
  "core_memories" jsonb,
  "evolution_log" jsonb,
  "last_self_update_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_identity_user_idx" ON "agent_identity" ("user_id");
