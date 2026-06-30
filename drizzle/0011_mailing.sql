-- Modulo inteligente de mailing (tarea 681 — mailing real)
-- Amplia el embudo (0010) a un mailer completo: campanas, plantillas,
-- segmentacion, tracking real via webhooks de Resend, opt-out/unsubscribe.

-- ── Leads: campos para segmentacion + salud del correo + opt-out ──────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags text;                 -- lista separada por comas
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'unknown'; -- unknown|valid|bounced|complained|invalid
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS leads_unsub_token_idx ON leads (unsubscribe_token);

-- ── Plantillas reutilizables (borradores guardados) ──────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_templates_user_idx ON email_templates (user_id, updated_at);

-- ── Campanas de correo ───────────────────────────────────────────────────
-- segment guarda { type:'all'|'status'|'tag'|'manual', value?, ids? }
CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  segment jsonb NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  status text NOT NULL DEFAULT 'draft',       -- draft|scheduled|sending|sent|failed
  scheduled_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_campaigns_user_idx ON email_campaigns (user_id, created_at);
CREATE INDEX IF NOT EXISTS email_campaigns_due_idx ON email_campaigns (status, scheduled_at);

-- ── email_log: enriquecido para tracking real de campanas ────────────────
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES email_campaigns(id) ON DELETE SET NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'funnel';   -- funnel|campaign
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS complained_at timestamptz;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS email_log_campaign_idx ON email_log (campaign_id);
CREATE INDEX IF NOT EXISTS email_log_external_idx ON email_log (external_id);

-- ── Bitacora cruda de eventos de webhook (auditoria + idempotencia) ──────
CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  type text NOT NULL,
  to_email text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_external_idx ON email_events (external_id);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON email_events (type, created_at);
