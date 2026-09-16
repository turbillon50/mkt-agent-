-- ---------------------------------------------------------------------------
-- 0013 — Multitenant real con Clerk Organizations.
--
-- La organización de Clerk es el TENANT. `users.is_admin` deja de ser el techo
-- del sistema y pasa a significar una sola cosa: dueño de la aplicación Goossip
-- (el que entra a /admin). El rol DENTRO de la org lo manda Clerk.
--
-- La migración de datos de esta corrida asume lo que hay hoy en producción:
-- dos usuarios (turbillon50@gmail.com y luisdelator@vmomentums.info) que son la
-- misma persona y un solo proyecto (V&LIVING). Todo eso cae bajo la org
-- "All Global Holding" (slug all-global). El bloque de backfill solo corre si
-- ya existen usuarios: en una base nueva no inventa una org fantasma.
-- ---------------------------------------------------------------------------

-- --- espejo de Clerk --------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id            text PRIMARY KEY,                       -- id de la org en Clerk
  name          text NOT NULL,
  slug          text,
  plan          text NOT NULL DEFAULT 'free',           -- free | pro | agency
  status        text NOT NULL DEFAULT 'active',         -- active | suspended
  owner_user_id text,                                   -- clerk_id del creador
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uniq
  ON organizations (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);

CREATE TABLE IF NOT EXISTS org_memberships (
  id             text PRIMARY KEY,                      -- id de la membresía en Clerk
  org_id         text NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  clerk_user_id  text NOT NULL,
  email          text,
  role           text NOT NULL DEFAULT 'org:member',    -- org:admin | org:member
  -- El proyecto activo se guarda por (user, org): el mismo usuario puede estar
  -- parado en V&LIVING en una org y en otro proyecto en la org de al lado.
  active_project_id uuid,
  last_seen_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS active_project_id uuid;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_org_user_uniq
  ON org_memberships (org_id, clerk_user_id);
CREATE INDEX IF NOT EXISTS org_memberships_user_idx ON org_memberships (clerk_user_id);

-- --- salud de la app: qué webhooks llegaron y cuáles reventaron -------------

CREATE TABLE IF NOT EXISTS webhook_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source     text NOT NULL,                             -- meta | whatsapp | clerk
  event      text,
  status     text NOT NULL DEFAULT 'ok',                -- ok | error | rejected
  detail     text,
  org_id     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_log_time_idx ON webhook_log (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_log_source_time_idx ON webhook_log (source, created_at DESC);

-- --- último acceso del usuario (columna de /admin) ---------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- --- org_id en todo lo que es dato de tenant --------------------------------

ALTER TABLE campaigns         ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE sales_leads       ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE sales_lead_events ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE conversations     ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE messages          ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE action_queue      ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE social_accounts   ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE knowledge         ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE posts             ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE plan_items        ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE competitor_links  ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE leads             ADD COLUMN IF NOT EXISTS org_id text;

-- --- migración de datos ------------------------------------------------------

DO $migracion$
DECLARE
  v_org   text := 'org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N';  -- All Global Holding en Clerk
  v_owner text;
BEGIN
  -- Base nueva: no hay nada que migrar y no se inventa una org que en Clerk
  -- puede no existir. Las orgs reales entran por /onboarding y por el webhook.
  IF NOT EXISTS (SELECT 1 FROM users) THEN
    RETURN;
  END IF;

  SELECT clerk_id INTO v_owner FROM users WHERE lower(email) = 'turbillon50@gmail.com' LIMIT 1;

  INSERT INTO organizations (id, name, slug, plan, status, owner_user_id)
  VALUES (v_org, 'All Global Holding', 'all-global', 'agency', 'active', v_owner)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        owner_user_id = COALESCE(organizations.owner_user_id, EXCLUDED.owner_user_id),
        updated_at = now();

  -- Membresías: las dos cuentas de Luis. El webhook de Clerk las reconcilia
  -- después; esto es solo para que /admin no arranque en blanco.
  INSERT INTO org_memberships (id, org_id, clerk_user_id, email, role)
  SELECT 'seed:' || v_org || ':' || u.clerk_id,
         v_org,
         u.clerk_id,
         u.email,
         'org:admin'
    FROM users u
   WHERE lower(u.email) IN ('turbillon50@gmail.com', 'luisdelator@vmomentums.info')
  ON CONFLICT (org_id, clerk_user_id) DO NOTHING;

  -- Todo lo que cuelga de un usuario o de un proyecto cae en esa org.
  UPDATE campaigns        SET org_id = v_org WHERE org_id IS NULL;
  UPDATE social_accounts  SET org_id = v_org WHERE org_id IS NULL;
  UPDATE competitor_links SET org_id = v_org WHERE org_id IS NULL;
  UPDATE leads            SET org_id = v_org WHERE org_id IS NULL;

  -- Derivadas: se toma la org del proyecto, no la constante, para que la
  -- migración siga siendo correcta si algún día hay más de una org antes de
  -- correrla.
  UPDATE sales_leads sl
     SET org_id = c.org_id
    FROM campaigns c
   WHERE c.id = sl.campaign_id AND sl.org_id IS NULL;

  UPDATE action_queue aq
     SET org_id = c.org_id
    FROM campaigns c
   WHERE c.id = aq.campaign_id AND aq.org_id IS NULL;

  UPDATE conversations cv
     SET org_id = c.org_id
    FROM campaigns c
   WHERE c.id = cv.campaign_id AND cv.org_id IS NULL;

  UPDATE sales_lead_events e
     SET org_id = sl.org_id
    FROM sales_leads sl
   WHERE sl.id = e.lead_id AND e.org_id IS NULL;

  UPDATE messages m
     SET org_id = cv.org_id
    FROM conversations cv
   WHERE cv.id = m.conversation_id AND m.org_id IS NULL;

  -- Huérfanas de verdad: conversaciones heredadas de Baileys sin proyecto, y
  -- las tablas de contenido que nunca tuvieron dueño (knowledge, posts, plan).
  UPDATE conversations SET org_id = v_org WHERE org_id IS NULL;
  UPDATE messages      SET org_id = v_org WHERE org_id IS NULL;
  UPDATE knowledge     SET org_id = v_org WHERE org_id IS NULL;
  UPDATE posts         SET org_id = v_org WHERE org_id IS NULL;
  UPDATE plan_items    SET org_id = v_org WHERE org_id IS NULL;
END
$migracion$;

-- --- candado: sin org_id no entra una fila más ------------------------------

ALTER TABLE campaigns         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE sales_leads       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE sales_lead_events ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE conversations     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE messages          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE action_queue      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE social_accounts   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE knowledge         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE posts             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE plan_items        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE competitor_links  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE leads             ALTER COLUMN org_id SET NOT NULL;

-- --- índices por org --------------------------------------------------------

CREATE INDEX IF NOT EXISTS campaigns_org_idx          ON campaigns (org_id);
CREATE INDEX IF NOT EXISTS sales_leads_org_idx        ON sales_leads (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_lead_events_org_idx  ON sales_lead_events (org_id);
CREATE INDEX IF NOT EXISTS conversations_org_idx      ON conversations (org_id);
CREATE INDEX IF NOT EXISTS messages_org_idx           ON messages (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_queue_org_idx       ON action_queue (org_id, status);
CREATE INDEX IF NOT EXISTS social_accounts_org_idx    ON social_accounts (org_id);
CREATE INDEX IF NOT EXISTS knowledge_org_idx          ON knowledge (org_id);
CREATE INDEX IF NOT EXISTS posts_org_idx              ON posts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_items_org_idx         ON plan_items (org_id);
CREATE INDEX IF NOT EXISTS competitor_links_org_idx   ON competitor_links (org_id);
CREATE INDEX IF NOT EXISTS leads_org_idx              ON leads (org_id, created_at DESC);

-- El slug del proyecto es único DENTRO de la org, no dentro del usuario.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_org_slug_uniq ON campaigns (org_id, slug);
