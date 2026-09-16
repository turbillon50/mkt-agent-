-- ---------------------------------------------------------------------------
-- Corrida 13: la bandeja social. Messenger y los DMs de Instagram entran a
-- `conversations` como un canal más.
--
-- Todo es `IF NOT EXISTS`: se puede volver a correr sin miedo. Y como manda la
-- 0019, una migración ya aplicada NO se edita; si falta algo, se hace la 0021.
--
-- Por qué estas columnas y no otras, una por una:
--
--   · `contact_name` — Messenger y los DMs traen a una PERSONA que casi nunca
--     es un lead del CRM: alguien que escribe "¿a qué hora abren?" no tiene
--     fila en `sales_leads`. Sin un nombre propio en el hilo, la pantalla de
--     Conversaciones tendría que pintar "Sin nombre" en todos, que es
--     exactamente lo que hace inútil una bandeja de entrada.
--   · `contact_external_id` — el PSID de Messenger / IGSID de Instagram. NO es
--     el id del hilo: para CONTESTAR, Meta pide el id de la persona, no el de
--     la conversación. Sin esta columna se puede leer y no se puede responder,
--     que es la mitad del encargo.
--   · `unread_count` — lo que dice Meta, no lo que deducimos nosotros. Un
--     contador calculado a partir de lo que alcanzamos a sincronizar miente en
--     cuanto el cliente contesta desde su celular.
--   · `last_synced_at` — cuándo se leyó de verdad este hilo. Es lo que deja
--     decir "hace 2 min" en vez de fingir que está al día.
--
-- El canal se queda como `text` a propósito: ya lo era, no hay CHECK que
-- ampliar, y los valores nuevos (`messenger`, `instagram`) entran solos.
-- ---------------------------------------------------------------------------

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "contact_name"        text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "contact_external_id" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "unread_count"        integer NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_synced_at"      timestamptz;

-- Para pintar la bandeja: los hilos de un proyecto ordenados por actividad.
CREATE INDEX IF NOT EXISTS "conversations_project_recientes_idx"
  ON "conversations" ("campaign_id", "updated_at" DESC);

-- ---------------------------------------------------------------------------
-- El correo del dueño para `notify_owner`.
--
-- La QA del 16-sep midió las 4 acciones `notify_owner` de MOMENTUM en `failed`
-- con `{"error":"el proyecto no tiene owner_phone en sus reglas"}` — teniendo
-- Gmail conectado y funcionando. `owner_email` vive en `campaigns.rules`
-- (jsonb), así que no hace falta columna; lo que sí hace falta es que los
-- proyectos que ya tienen un dueño con correo no empiecen de cero.
--
-- Se rellena desde el dueño del proyecto en `project_members`. Sin inventar:
-- solo donde hay un correo real y `rules` todavía no trae uno.
-- ---------------------------------------------------------------------------

UPDATE "campaigns" c
SET "rules" = COALESCE(c."rules", '{}'::jsonb) || jsonb_build_object('owner_email', m."email")
FROM (
  SELECT DISTINCT ON (pm."project_id") pm."project_id", pm."email"
  FROM "project_members" pm
  WHERE pm."role" = 'dueño' AND pm."email" IS NOT NULL AND pm."email" <> ''
  ORDER BY pm."project_id", pm."created_at" ASC
) m
WHERE m."project_id" = c."id"
  AND COALESCE(c."rules" ->> 'owner_email', '') = '';
