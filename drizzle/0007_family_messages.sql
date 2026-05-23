CREATE TABLE IF NOT EXISTS family_messages (
  id                BIGSERIAL PRIMARY KEY,
  message_id        TEXT UNIQUE NOT NULL,
  channel           TEXT NOT NULL,
  sender            TEXT NOT NULL,
  sender_kind       TEXT NOT NULL,
  content           TEXT NOT NULL,
  payload           JSONB,
  reply_to          TEXT,
  mentions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  family_created_at TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_family_messages_channel_received
  ON family_messages (channel, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_family_messages_sender_received
  ON family_messages (sender, received_at DESC);
