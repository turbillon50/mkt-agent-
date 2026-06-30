-- Addendum tarea 681 — puntos 7/8/9:
-- (9) lat/lng en leads para el mapa real (Leaflet/OSM)
-- (8) email en leads para mailing via Resend
-- (7) embudo de automatizacion: funnels + enrollments + bitacora de correos

ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lat text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lng text;

-- Embudos: una regla por usuario. trigger_status dispara la secuencia.
-- steps es un arreglo ordenado [{delayHours, subject, body}].
CREATE TABLE IF NOT EXISTS funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_status text NOT NULL DEFAULT 'new',
  enabled boolean NOT NULL DEFAULT true,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funnels_user_idx ON funnels (user_id);

-- Inscripciones: cada lead que entra a un embudo avanza paso a paso.
CREATE TABLE IF NOT EXISTS funnel_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS funnel_enrollments_uniq ON funnel_enrollments (funnel_id, lead_id);
CREATE INDEX IF NOT EXISTS funnel_enrollments_due_idx ON funnel_enrollments (status, next_run_at);

-- Bitacora de correos enviados (evita duplicados + da evidencia real).
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  funnel_id uuid REFERENCES funnels(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  step integer,
  provider text NOT NULL DEFAULT 'resend',
  status text NOT NULL DEFAULT 'sent',
  error text,
  external_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_user_idx ON email_log (user_id, sent_at);
