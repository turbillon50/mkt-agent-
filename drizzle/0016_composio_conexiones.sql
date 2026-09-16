-- ---------------------------------------------------------------------------
-- Corrida 5: las conexiones del proyecto las lleva Composio.
--
-- Nació como 0015 y se renumeró a 0016 al rebasar sobre main, donde la corrida
-- 4 ya se había quedado con el 0015. Se puede volver a correr sin miedo: todo
-- lo de abajo es `IF NOT EXISTS` y el UPDATE solo toca filas sin verificar.
--
-- Dos cosas y nada más:
--
--   1. `composio_auth_configs` — la "app" que Composio administra por toolkit.
--      Se crea UNA vez por toolkit con `use_composio_managed_auth` y su id
--      (`ac_xxx`) se guarda aquí. Sin esta tabla, cada arranque volvería a
--      crear auth configs nuevos en Composio y la cuenta se llenaría de
--      duplicados que nadie sabe cuál usa cuál.
--
--   2. `social_accounts.verified_at` — cuándo fue la última vez que Composio
--      confirmó que la cuenta sigue viva. Regla del issue #33: nada se pinta de
--      verde con una verificación de más de 24 h. Una bandera "ya conectó" se
--      queda mintiendo el día que el cliente revoca el permiso desde Facebook.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS composio_auth_configs (
  toolkit        text PRIMARY KEY,
  auth_config_id text NOT NULL,
  managed        boolean NOT NULL DEFAULT true,
  -- El logo y el nombre salen del catálogo de Composio (`toolkit.meta.logo`),
  -- no de nuestra imaginación: así la tarjeta enseña la marca de verdad y no
  -- hay que versionar 21 PNG que envejecen solos.
  logo           text,
  name           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Las que ya estaban conectadas antes de esta corrida nacen verificadas en su
-- fecha de conexión: no es inventar una verificación, es no borrar la que ya
-- había. La primera pasada del verificador las pondrá al día o las marcará
-- "Reconectar" con su motivo.
UPDATE social_accounts
   SET verified_at = connected_at
 WHERE verified_at IS NULL
   AND status = 'connected'
   AND connected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_accounts_verified_idx
  ON social_accounts (campaign_id, verified_at);
