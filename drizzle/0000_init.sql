-- Phase 1 initial schema. Idempotent; safe to re-run.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  text text NOT NULL,
  topic text,
  angle text,
  external_id text,
  external_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS posts_platform_idx ON posts (platform);
CREATE INDEX IF NOT EXISTS posts_created_idx  ON posts (created_at);

CREATE TABLE IF NOT EXISTS knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  content text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  external_id text NOT NULL,
  author_handle text,
  text text NOT NULL,
  in_reply_to text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mentions_ext_uniq    ON mentions (platform, external_id);
CREATE INDEX        IF NOT EXISTS mentions_status_idx  ON mentions (status);

CREATE TABLE IF NOT EXISTS replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_id uuid REFERENCES mentions(id) ON DELETE CASCADE,
  text text NOT NULL,
  external_id text,
  external_url text,
  posted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  likes integer NOT NULL DEFAULT 0,
  reposts integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  collected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  day_offset integer NOT NULL,
  platform text NOT NULL,
  topic text NOT NULL,
  angle text,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_items_plan_idx   ON plan_items (plan_id);
CREATE INDEX IF NOT EXISTS plan_items_unused_idx ON plan_items (used);

CREATE TABLE IF NOT EXISTS embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type text NOT NULL,
  ref_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embeddings_ref_idx ON embeddings (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS embeddings_vec_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
