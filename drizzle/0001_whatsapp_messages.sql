CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "external_id" text,
  "from_number" text NOT NULL,
  "to_number" text,
  "body" text NOT NULL,
  "direction" text NOT NULL,
  "responded_by" text,
  "message_timestamp" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_ext_uniq"
  ON "whatsapp_messages" ("external_id")
  WHERE "external_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_messages_from_idx"
  ON "whatsapp_messages" ("from_number");

CREATE INDEX IF NOT EXISTS "whatsapp_messages_time_idx"
  ON "whatsapp_messages" ("message_timestamp" DESC);
