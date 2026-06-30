-- Features influencer + ventas (feat/influencer-features)
-- Tablas nuevas para: ofertas flash, landings por campana, embajadores,
-- story links, votaciones, reglas de comentario, senales de hot-lead, membresias.

CREATE TABLE IF NOT EXISTS flash_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  price text,
  currency text NOT NULL DEFAULT 'MXN',
  destination_url text NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  click_count integer NOT NULL DEFAULT 0,
  conversion_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS flash_offers_slug_uniq ON flash_offers (slug);
CREATE INDEX IF NOT EXISTS flash_offers_user_idx ON flash_offers (user_id, created_at);

CREATE TABLE IF NOT EXISTS campaign_landings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  description text,
  cta_label text NOT NULL DEFAULT 'Quiero más información',
  published boolean NOT NULL DEFAULT true,
  views integer NOT NULL DEFAULT 0,
  submissions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_landings_slug_uniq ON campaign_landings (slug);
CREATE INDEX IF NOT EXISTS campaign_landings_user_idx ON campaign_landings (user_id, created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  visits integer NOT NULL DEFAULT 0,
  leads_generated integer NOT NULL DEFAULT 0,
  sales_generated integer NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'bronce',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_code_uniq ON referrals (code);
CREATE INDEX IF NOT EXISTS referrals_user_idx ON referrals (user_id);
CREATE INDEX IF NOT EXISTS referrals_lead_idx ON referrals (lead_id);

CREATE TABLE IF NOT EXISTS story_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  default_url text NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  click_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_links_slug_uniq ON story_links (slug);
CREATE INDEX IF NOT EXISTS story_links_user_idx ON story_links (user_id);

CREATE TABLE IF NOT EXISTS link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_link_id uuid NOT NULL REFERENCES story_links(id) ON DELETE CASCADE,
  matched_url text NOT NULL,
  utm_source text,
  utm_campaign text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_clicks_link_idx ON link_clicks (story_link_id, created_at);

CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  question text NOT NULL,
  description text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  winner_option_id text,
  total_votes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS polls_slug_uniq ON polls (slug);
CREATE INDEX IF NOT EXISTS polls_user_idx ON polls (user_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  name text,
  email text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_poll_email_uniq ON poll_votes (poll_id, email);
CREATE INDEX IF NOT EXISTS poll_votes_poll_idx ON poll_votes (poll_id);

CREATE TABLE IF NOT EXISTS comment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'instagram',
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_message text NOT NULL,
  payment_link text,
  active boolean NOT NULL DEFAULT true,
  matched_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comment_rules_user_idx ON comment_rules (user_id);

CREATE TABLE IF NOT EXISTS lead_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_signals_lead_idx ON lead_signals (lead_id);
CREATE INDEX IF NOT EXISTS lead_signals_user_idx ON lead_signals (user_id, created_at);

CREATE TABLE IF NOT EXISTS membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price text NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  interval text NOT NULL DEFAULT 'mensual',
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  whatsapp_number text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_plans_user_idx ON membership_plans (user_id);
