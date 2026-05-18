-- Embeddings table was empty; recreate with 1024 dims so it matches the
-- default of Jina v3 / Voyage-3 / Cohere embed-v3 (all top free-tier providers).
-- OpenAI 3-small remains usable by setting EMBEDDINGS_DIMENSIONS=1536 and
-- altering this column back.

DROP TABLE IF EXISTS "embeddings" CASCADE;

CREATE TABLE "embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ref_type" text NOT NULL,
  "ref_id" uuid NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "embeddings_ref_idx" ON "embeddings" ("ref_type", "ref_id");
CREATE INDEX "embeddings_vec_idx" ON "embeddings" USING hnsw (embedding vector_cosine_ops);
