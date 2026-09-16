-- ---------------------------------------------------------------------------
-- Corrida 7: prospección por Google Maps, competencia por proyecto, el visor
-- con aprobación y la autonomía de Goossip.
--
-- Todo es `IF NOT EXISTS`: se puede volver a correr sin miedo.
--
-- Regla que se hereda de la 0018 y que aquí se respeta: una migración ya
-- aplicada NO se edita. Si falta algo, se hace la 0020.
--
-- Cinco cosas y ninguna se parece a las otras en a quién pertenece:
--
--   1. `prospects` — negocios encontrados en Google Maps. Son del PROYECTO,
--      no de la organización: dos clientes de la misma agencia pueden prospectar
--      el mismo giro en la misma zona y sus listas no se mezclan.
--   2. `prospect_searches` — la bitácora de búsquedas. Existe SOLO porque
--      Places cobra por búsqueda: sin ella, "cuántas van este mes" se contesta
--      adivinando, y el tope de gasto de Ajustes no tendría contra qué medir.
--   3. `project_competitors` + `competitor_snapshots` — los rivales del
--      proyecto y lo que se leyó de ellos, con la FUENTE de cada lectura.
--   4. `lessons` — lo que Goossip aprendió de cada corrección humana, con
--      embedding. Es del PROYECTO: cómo corrige sus piezas el de tacos no le
--      sirve al desarrollador inmobiliario.
--   5. Columnas nuevas en `creative_pieces` para el flujo de aprobación
--      (borrador → en revisión → aprobado → programado → publicado).
-- ---------------------------------------------------------------------------

-- 1. Prospección por Google Maps --------------------------------------------

CREATE TABLE IF NOT EXISTS prospects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- El id de Google del lugar. Es la llave de idempotencia: buscar dos veces
  -- "restaurantes en Tulum" no puede dejar el mismo restaurante dos veces en la
  -- lista del vendedor.
  place_id     text NOT NULL,
  name         text NOT NULL,
  address      text,
  phone        text,
  website      text,
  rating       numeric(2,1),
  -- Cuánta gente lo calificó. Un 5.0 con 2 reseñas y un 4.3 con 900 no son lo
  -- mismo y ordenarlos por rating a secas miente.
  ratings_count integer,
  category     text,
  lat          double precision,
  lng          double precision,
  maps_url     text,
  -- 'google_maps' siempre hoy. La columna existe para el día que entre otra
  -- fuente OFICIAL; nunca para un scraper.
  source       text NOT NULL DEFAULT 'google_maps',
  -- 'nuevo' | 'contactado' | 'descartado' | 'convertido'
  status       text NOT NULL DEFAULT 'nuevo',
  -- Lo que se sacó del SITIO PÚBLICO del negocio: correo, WhatsApp y las redes
  -- que ellos mismos publican en su página. Nada de perfiles personales.
  enrichment   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- La búsqueda que lo trajo. Sirve para "de dónde salió este prospecto".
  search_id    uuid,
  lead_id      uuid REFERENCES sales_leads(id) ON DELETE SET NULL,
  found_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Único POR PROYECTO, no global: el mismo restaurante puede ser prospecto de
-- dos clientes distintos y esconderle uno a otro sería un bug, no una feature.
CREATE UNIQUE INDEX IF NOT EXISTS prospects_project_place_idx
  ON prospects (project_id, place_id);
CREATE INDEX IF NOT EXISTS prospects_project_status_idx
  ON prospects (project_id, status, found_at DESC);
CREATE INDEX IF NOT EXISTS prospects_org_idx ON prospects (org_id);

-- 2. La bitácora de búsquedas (Places cobra por búsqueda) --------------------

CREATE TABLE IF NOT EXISTS prospect_searches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- 'texto' | 'cerca'
  kind         text NOT NULL DEFAULT 'texto',
  query        text NOT NULL,
  zone         text,
  radius_m     integer,
  -- 'composio' cuando salió por la cuenta de Google del cliente, 'places'
  -- cuando salió por la llave oficial de la casa. Se guarda porque el costo
  -- cae en bolsillos distintos.
  via          text NOT NULL DEFAULT 'places',
  results      integer NOT NULL DEFAULT 0,
  nuevos       integer NOT NULL DEFAULT 0,
  -- Lo que Google cobra: una búsqueda es una búsqueda, la pida quien la pida.
  cost_units   integer NOT NULL DEFAULT 1,
  error        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_searches_project_idx
  ON prospect_searches (project_id, created_at DESC);

-- 3. Competencia DEL PROYECTO ------------------------------------------------

CREATE TABLE IF NOT EXISTS project_competitors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL,
  website      text,
  -- Las redes PÚBLICAS DE NEGOCIO del rival: { facebook, instagram, linkedin,
  -- tiktok, youtube, twitter }. Nunca un perfil personal: es la regla de la
  -- casa y la que evita bans y demandas.
  handles      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_competitors_unico_idx
  ON project_competitors (project_id, lower(name));
CREATE INDEX IF NOT EXISTS project_competitors_project_idx
  ON project_competitors (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  project_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- NULL = la lectura es del PROPIO proyecto. Es lo que hace posible el
  -- "publican 5 por semana, tú 1" sin una segunda tabla.
  competitor_id uuid REFERENCES project_competitors(id) ON DELETE CASCADE,
  red           text NOT NULL,
  -- De dónde salió el número, literal: 'composio' | 'web' | 'ninguna'. Va
  -- pegado al dato porque un promedio sin fuente no se puede defender.
  fuente        text NOT NULL,
  -- Cuando la fuente se negó, aquí queda POR QUÉ, con el código. Meta pide
  -- revisión de app para leer la página de otro y eso no es un misterio: se
  -- anota y se dice en pantalla.
  motivo        text,
  posts_leidos  integer NOT NULL DEFAULT 0,
  por_semana    numeric(6,2),
  ultimo_post   timestamptz,
  formatos      jsonb NOT NULL DEFAULT '{}'::jsonb,
  seguidores    integer,
  muestra       jsonb NOT NULL DEFAULT '[]'::jsonb,
  leido_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitor_snapshots_project_idx
  ON competitor_snapshots (project_id, leido_en DESC);
CREATE INDEX IF NOT EXISTS competitor_snapshots_rival_idx
  ON competitor_snapshots (competitor_id, leido_en DESC);

-- 4. Lo que Goossip aprende de cada corrección -------------------------------
--
-- Una lección se guarda SOLO cuando hubo una corrección humana de verdad: una
-- pieza editada, un rechazo, una respuesta cambiada. Nada de "acierto"
-- automático — un sistema que se felicita solo aprende a felicitarse.

CREATE TABLE IF NOT EXISTS lessons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- 'pieza_rechazada' | 'pieza_editada' | 'cambios_pedidos' | 'texto_corregido'
  kind         text NOT NULL,
  -- Qué hizo Goossip.
  que_hizo     text NOT NULL,
  -- Qué corrigió la persona. Es la mitad que enseña.
  que_corrigio text NOT NULL,
  -- La lección en una línea, como se la vamos a decir al modelo.
  leccion      text NOT NULL,
  ref_type     text,
  ref_id       uuid,
  actor        text,
  embedding    vector(1024),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lessons_project_idx ON lessons (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lessons_vec_idx
  ON lessons USING hnsw (embedding vector_cosine_ops);

-- 5. El flujo de aprobación de una pieza -------------------------------------
--
-- `estado` ya era texto libre, así que los estados nuevos ('en_revision',
-- 'cambios', 'programada') no piden migración. Lo que sí hacía falta:

-- Cuándo debe salir. Sin esto, "programada" no significa nada.
ALTER TABLE creative_pieces ADD COLUMN IF NOT EXISTS programada_para timestamptz;
-- Lo que pidió quien apretó "Pedir cambios", con sus palabras.
ALTER TABLE creative_pieces ADD COLUMN IF NOT EXISTS comentario text;
-- Quién movió el estado la última vez y cuándo. La bitácora fina vive en
-- `project_events`; esto es lo que la tarjeta necesita sin hacer otra consulta.
ALTER TABLE creative_pieces ADD COLUMN IF NOT EXISTS estado_por text;
ALTER TABLE creative_pieces ADD COLUMN IF NOT EXISTS estado_en timestamptz;

CREATE INDEX IF NOT EXISTS creative_pieces_estado_idx
  ON creative_pieces (project_id, estado, programada_para);
