-- ---------------------------------------------------------------------------
-- 0014 — El PROYECTO es la unidad central.
--
-- Hasta la 0013 el tenant era la organización y el proyecto era poco más que
-- una etiqueta. Aquí el proyecto gana lo que le faltaba para ser el centro:
--
--   · su GENTE  (project_members)      — quién entra y con qué rol
--   · sus ENLACES (connection_links)   — "conéctame tu Facebook", un solo uso
--   · su BITÁCORA (project_events)     — quién conectó, revocó, invitó, cambió
--   · sus CONEXIONES por proyecto      — social_accounts.campaign_id
--
-- La tabla del proyecto sigue llamándose `campaigns` (ver 0012): renombrarla
-- en una base de producción pediría tocar 12 llaves foráneas y no compra nada.
-- En la app se llama PROYECTO en todos lados.
--
-- El backfill solo corre si ya hay proyectos: en una base nueva no inventa
-- miembros de la nada.
-- ---------------------------------------------------------------------------

-- --- perfil del proyecto (paso 1 del alta) ---------------------------------
-- Sitio, ciudad y país eran datos que el alta pedía y no tenían dónde vivir.
-- Van como columnas y no dentro de `channels` porque describen al NEGOCIO, no
-- a un canal: meterlos en el jsonb de canales los haría invisibles a un `where`.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS city    text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS country text;

-- --- la gente del proyecto --------------------------------------------------
-- Roles POR PROYECTO, distintos de los roles de org de Clerk:
--   dueño    — todo, incluido invitar y borrar
--   editor   — opera leads, conversaciones y contenido
--   conector — SOLO conecta y revoca canales (el community manager del cliente)
--   lector   — mira y no toca
--
-- Un org:owner / org:admin de Clerk es dueño implícito de todos los proyectos
-- de su organización y no necesita fila aquí: si la necesitara, un admin nuevo
-- entraría a una org sin poder ver nada.

CREATE TABLE IF NOT EXISTS project_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  project_id    uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  clerk_user_id text,                                   -- null mientras la invitación no se acepta
  email         text,
  role          text NOT NULL DEFAULT 'lector',         -- dueño | editor | conector | lector
  status        text NOT NULL DEFAULT 'invitado',       -- invitado | activo
  invitation_id text,                                   -- id de la invitación de Clerk
  invited_by    text,                                   -- clerk_id de quien invitó
  joined_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Un usuario, un rol por proyecto. El índice es parcial porque `clerk_user_id`
-- viaja nulo mientras la invitación está en el aire, y en Postgres dos NULL no
-- chocan: sin el WHERE, dos invitaciones al mismo correo pasarían igual.
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_uniq
  ON project_members (project_id, clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_email_uniq
  ON project_members (project_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_members_user_idx  ON project_members (clerk_user_id);
CREATE INDEX IF NOT EXISTS project_members_org_idx   ON project_members (org_id, project_id);
CREATE INDEX IF NOT EXISTS project_members_invite_idx ON project_members (invitation_id);

-- --- enlaces de conexión de un solo uso -------------------------------------
-- "Pídele a alguien que conecte su Facebook a este proyecto": se manda un
-- enlace, la persona entra, hace el OAuth y ya. No ve el resto de Goossip.
--
-- Del token se guarda SOLO el hash (sha256). Si alguien se lleva la tabla, no
-- se lleva ningún enlace usable — el mismo criterio que con una contraseña.

CREATE TABLE IF NOT EXISTS connection_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  project_id  uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  channel     text NOT NULL,                            -- meta | whatsapp | linkedin | ...
  token_hash  text NOT NULL UNIQUE,
  created_by  text NOT NULL,                            -- clerk_id de quien lo generó
  note        text,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  used_by     text,                                     -- clerk_id de quien lo quemó
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connection_links_project_idx ON connection_links (project_id, created_at DESC);

-- --- bitácora del proyecto --------------------------------------------------
-- Mismo espíritu que `sales_lead_events`, pero del proyecto: cada conexión,
-- revocación, invitación y cambio de rol deja constancia de quién y cuándo.

CREATE TABLE IF NOT EXISTS project_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  project_id  uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  type        text NOT NULL,                            -- channel_connected | channel_revoked | member_invited | ...
  actor       text,                                     -- clerk_id, o 'goossip' para lo automático
  actor_email text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_events_project_idx ON project_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_events_type_idx    ON project_events (project_id, type);

-- --- las conexiones cuelgan del PROYECTO, no del usuario --------------------
-- Antes una cuenta conectada era de (user, platform): si el usuario se iba de
-- la agencia, el canal del cliente se iba con él. Ahora es del proyecto, y se
-- registra QUIÉN la conectó y cuándo.

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS campaign_id   uuid REFERENCES campaigns (id) ON DELETE CASCADE;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS connected_by  text;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS connected_at  timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS label         text;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS external_id   text;

-- `user_id` pasa a ser opcional: un canal conectado por un invitado con enlace
-- pertenece al PROYECTO. Que su fila muriera al borrar al invitado sería perder
-- la conexión del cliente por irse un ayudante.
ALTER TABLE social_accounts ALTER COLUMN user_id DROP NOT NULL;

-- Un canal, una conexión por proyecto. Parcial: las filas heredadas de la 0013
-- no tienen proyecto y no deben chocar entre ellas.
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_project_platform_uniq
  ON social_accounts (campaign_id, platform) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_accounts_project_idx ON social_accounts (campaign_id);

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_projects int;
BEGIN
  SELECT count(*) INTO v_projects FROM campaigns;
  IF v_projects = 0 THEN
    RAISE NOTICE '0014: no hay proyectos, no hay nada que rellenar.';
    RETURN;
  END IF;

  -- 1. Cada proyecto existente estrena a su creador como DUEÑO. Sin esto, el
  --    día que la app empiece a exigir fila en project_members, el dueño de
  --    V&LIVING se quedaría fuera de su propio proyecto.
  INSERT INTO project_members (org_id, project_id, clerk_user_id, email, role, status, invited_by, joined_at)
  SELECT c.org_id, c.id, u.clerk_id, u.email, 'dueño', 'activo', u.clerk_id, c.created_at
  FROM campaigns c
  JOIN users u ON u.id = c.user_id
  ON CONFLICT DO NOTHING;

  -- 2. Y el dueño de la ORGANIZACIÓN también, si no es el mismo. Es quien paga.
  INSERT INTO project_members (org_id, project_id, clerk_user_id, email, role, status, invited_by, joined_at)
  SELECT c.org_id, c.id, o.owner_user_id, m.email, 'dueño', 'activo', o.owner_user_id, c.created_at
  FROM campaigns c
  JOIN organizations o ON o.id = c.org_id AND o.owner_user_id IS NOT NULL
  LEFT JOIN org_memberships m ON m.org_id = o.id AND m.clerk_user_id = o.owner_user_id
  ON CONFLICT DO NOTHING;

  -- 3. Las cuentas sociales sueltas se amarran al proyecto activo de su dueño,
  --    y si no tiene, al único proyecto de la org. Si la org tiene varios y no
  --    hay activo, se quedan sin proyecto: adivinar cuál sería peor que dejarlo
  --    en blanco — la UI las trata como "sin conectar" y se vuelven a conectar.
  --
  --    Las conexiones eran de (usuario, plataforma) y ahora son de (proyecto,
  --    plataforma). Dos usuarios de la misma org traen dos filas de 'twitter'
  --    que ahora apuntarían al mismo proyecto: solo se queda UNA, la conectada
  --    y más reciente. La otra se deja sin proyecto — no se borra, porque es
  --    historia de alguien.
  WITH candidatas AS (
    SELECT sa.id AS sa_id,
           sa.platform,
           sa.status,
           sa.updated_at,
           (SELECT u3.clerk_id FROM users u3 WHERE u3.id = sa.user_id) AS clerk_id,
           COALESCE(
             (SELECT m.active_project_id FROM org_memberships m
               JOIN users u2 ON u2.clerk_id = m.clerk_user_id
              WHERE m.org_id = sa.org_id AND u2.id = sa.user_id
                AND m.active_project_id IS NOT NULL LIMIT 1),
             (SELECT c.id FROM campaigns c
               WHERE c.org_id = sa.org_id
                 AND (SELECT count(*) FROM campaigns c2 WHERE c2.org_id = sa.org_id) = 1
               LIMIT 1)
           ) AS project_id
    FROM social_accounts sa
    WHERE sa.campaign_id IS NULL
  ),
  elegidas AS (
    SELECT DISTINCT ON (project_id, platform) sa_id, project_id, clerk_id
    FROM candidatas
    WHERE project_id IS NOT NULL
    ORDER BY project_id, platform, (status = 'connected') DESC, updated_at DESC
  )
  UPDATE social_accounts sa
  SET campaign_id = e.project_id,
      connected_by = e.clerk_id,
      connected_at = CASE WHEN sa.status = 'connected' THEN sa.updated_at ELSE NULL END
  FROM elegidas e
  WHERE sa.id = e.sa_id;

  RAISE NOTICE '0014: % proyectos con miembros y conexiones rellenados.', v_projects;
END $$;
