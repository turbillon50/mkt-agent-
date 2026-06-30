ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "draft_message" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "rating" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
