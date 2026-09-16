-- ---------------------------------------------------------------------------
-- Corrida 6: el motor de piezas, el kit de marca del proyecto y la memoria de
-- diseño de Goossip.
--
-- Se puede volver a correr sin miedo: todo es `IF NOT EXISTS`.
--
-- Tres tablas y ninguna se parece a las otras en a quién pertenece:
--
--   1. `design_knowledge` — es de la APLICACIÓN, no de un proyecto ni de una
--      organización. Cómo se diseña para Instagram es lo mismo para el cliente
--      de tacos que para el desarrollador inmobiliario, y copiarlo por proyecto
--      sería pagar el mismo embedding N veces. Por eso lleva `scope` y no
--      `org_id`: la columna dice en voz alta que este dato es global.
--
--   2. `project_brand_kit` — es del PROYECTO, una fila por proyecto. Logo,
--      paleta, tipografías, tono y palabras prohibidas. Todo lo que Goossip
--      genere para ese proyecto lee de aquí.
--
--   3. `creative_pieces` — cada pieza que se generó, con el prompt, el modelo,
--      el motor que la compuso y una FOTO del kit con el que se hizo. La foto
--      importa: si el cliente cambia el azul de su marca en noviembre, la pieza
--      de septiembre tiene que poder decir con qué azul se hizo.
-- ---------------------------------------------------------------------------

-- 1. Memoria de diseño (ámbito global de la app) -----------------------------

CREATE TABLE IF NOT EXISTS design_knowledge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Hoy siempre 'global'. La columna existe para que el día que haya memoria
  -- de diseño privada de un cliente no haya que migrar la tabla entera.
  scope        text NOT NULL DEFAULT 'global',
  -- 'higgsfield' | 'diseno' | 'marca' | 'spec-red' | 'playbook' | 'brain'
  category     text NOT NULL,
  title        text,
  content      text NOT NULL,
  -- De dónde salió: la ruta del archivo en skills-vault, o la URL oficial
  -- cuando es una spec de red. Es la mitad de la llave de idempotencia.
  source_path  text NOT NULL,
  -- SHA-256 del ARCHIVO COMPLETO, no del pedazo. Así una re-corrida compara un
  -- hash por archivo y no N: si el archivo no cambió, no se vuelve a leer ni a
  -- pagar embeddings de sus pedazos.
  source_hash  text NOT NULL,
  chunk_index  integer NOT NULL DEFAULT 0,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Mismas 1024 dimensiones que `embeddings` (migración 0006): es el mismo
  -- proveedor y así una consulta puede cruzar las dos tablas sin convertir.
  embedding    vector(1024),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- La llave de la idempotencia. Sin esto, correr la ingesta dos veces mete el
-- mismo pedazo dos veces y el Asistente contesta la misma spec repetida.
CREATE UNIQUE INDEX IF NOT EXISTS design_knowledge_source_chunk_uniq
  ON design_knowledge (source_path, chunk_index);

CREATE INDEX IF NOT EXISTS design_knowledge_category_idx
  ON design_knowledge (category);

CREATE INDEX IF NOT EXISTS design_knowledge_hash_idx
  ON design_knowledge (source_hash);

CREATE INDEX IF NOT EXISTS design_knowledge_vec_idx
  ON design_knowledge USING hnsw (embedding vector_cosine_ops);

-- 2. Kit de marca del proyecto -----------------------------------------------

CREATE TABLE IF NOT EXISTS project_brand_kit (
  project_id      uuid PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  org_id          text NOT NULL,
  -- Los logos viven fuera de la base (el almacenamiento de medios de la casa);
  -- aquí solo su dirección pública.
  logo_url        text,
  logo_oscuro_url text,
  -- [{ "rol": "primario", "hex": "#0B5FFF", "nombre": "Azul Momentum" }, …]
  -- El ROL es lo que usa el motor de piezas: "primario" y "fondo" significan
  -- algo al componer; "#0B5FFF" suelto, no.
  paleta          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ "rol": "titulos", "familia": "Inter", "peso": "700" }, …]
  tipografias     jsonb NOT NULL DEFAULT '[]'::jsonb,
  tono            text,
  palabras_prohibidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Piezas que el cliente ya aprobó, como ejemplo para el prompt.
  ejemplos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- El Soul de Higgsfield, si el cliente entrenó su cara/persona.
  soul_id         text,
  -- Lo que propuso Gemini al mirar el logo, ANTES de que el usuario corrigiera.
  -- Se guarda aparte del kit vivo para poder comparar qué cambió a mano.
  propuesta       jsonb,
  aprobado_por    text,
  aprobado_en     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_brand_kit_org_idx ON project_brand_kit (org_id);

-- 3. Las piezas --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creative_pieces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  red          text NOT NULL,
  formato      text NOT NULL,
  tipo         text NOT NULL DEFAULT 'imagen',
  -- Lo que pidió el usuario, con sus palabras.
  brief        text NOT NULL,
  -- El prompt COMPLETO que se le mandó al modelo. Sin esto, una pieza que
  -- salió bien no se puede repetir.
  prompt       text NOT NULL,
  modelo       text,
  -- Quién la compuso: 'gemini' (base), 'canva', 'sharp', 'higgsfield'.
  motor        text NOT NULL DEFAULT 'gemini',
  url          text,
  ancho        integer,
  alto         integer,
  -- La foto del kit con el que se generó.
  kit_usado    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'propuesta' | 'aprobada' | 'descartada' | 'publicada'
  estado       text NOT NULL DEFAULT 'propuesta',
  aprobada_por text,
  aprobada_en  timestamptz,
  post_id      uuid REFERENCES posts(id) ON DELETE SET NULL,
  -- Las piezas de un mismo brief comparten este id: son las 2-3 opciones que
  -- Goossip nunca deja de dar. Sin él, la galería no sabe cuáles compiten.
  lote_id      uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_pieces_project_idx
  ON creative_pieces (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS creative_pieces_red_idx
  ON creative_pieces (project_id, red);

CREATE INDEX IF NOT EXISTS creative_pieces_lote_idx
  ON creative_pieces (lote_id);
