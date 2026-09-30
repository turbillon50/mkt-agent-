-- Corrida 14 — el motor de análisis. Agnóstico al producto: nada aquí sabe que
-- Goossip vendió apps alguna vez. Un proyecto de departamentos en Miami usa las
-- mismas seis tablas que una fábrica de software.
--
-- Solo AGREGA. No borra, no renombra, no transforma nada existente.
--
-- Lo que NO se crea aquí y por qué:
--   · lecciones por proyecto → ya existe `lessons` (org_id + project_id + ref_type/ref_id
--     + embedding). Le colgamos las lecciones de hipótesis con ref_type='hipotesis'.
--     Duplicarla sería partir la memoria del proyecto en dos.
--   · competidores y sus lecturas → ya existen `project_competitors` y
--     `competitor_snapshots` (corrida 7). El radar escribe ahí, no en tablas nuevas.

-- ---------------------------------------------------------------------------
-- 1. Ficha del proyecto (paso 0). El documento de contexto compartido que leen
--    TODAS las etapas. Se arma sola del sitio, de los anuncios activos y de los
--    leads; al dueño solo se le hacen las pocas preguntas que no se pueden medir.
--
--    `origenes` guarda, campo por campo, de dónde salió: {campo: {origen, url,
--    fecha, metodo}}. Sin eso la ficha es una opinión anónima y no se le puede
--    enseñar al comprador, que es justo lo que pide el principio 1.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_brief" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL UNIQUE REFERENCES "campaigns"("id") ON DELETE CASCADE,

  -- Qué vende. En palabras del negocio, no en jerga de marketing.
  "que_vende" text,
  "categoria" text,
  "propuesta_valor" text,

  -- Precio. Nullable a propósito: NO SABER el precio es un estado legítimo y se
  -- dice en pantalla. Rellenarlo con un promedio de internet sería inventar.
  "precio_min" numeric(14,2),
  "precio_max" numeric(14,2),
  "moneda" text,
  "precio_nota" text,

  -- Dónde vende: [{ciudad, pais, prioridad}]. Un proyecto puede vender en Miami
  -- a compradores de CDMX; por eso mercado y idioma van aparte.
  "mercados" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "idiomas" jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Qué ya funcionó y qué no. Lo más valioso que tiene el dueño y lo que nadie
  -- le pregunta.
  "ya_funciono" text,
  "ya_no_funciono" text,

  -- Procedencia por campo: {campo: {origen, url, fecha, metodo}}
  -- origen ∈ dueño | sitio | anuncios | leads | modelo
  "origenes" jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- El documento en prosa. Es lo que se le inyecta a cada etapa como contexto.
  "resumen" text,

  -- Las pocas preguntas que faltan: [{clave, pregunta, porque}]
  "preguntas_pendientes" jsonb NOT NULL DEFAULT '[]'::jsonb,

  "estado" text NOT NULL DEFAULT 'vacia',
  "confirmada_por" text,
  "confirmada_en" timestamptz,
  "armada_en" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "project_brief_estado_chk"
    CHECK ("estado" IN ('vacia', 'borrador', 'confirmada')),
  -- Un precio invertido es un dato roto, no un dato pobre.
  CONSTRAINT "project_brief_precio_chk"
    CHECK ("precio_min" IS NULL OR "precio_max" IS NULL OR "precio_min" <= "precio_max"),
  -- Si hay precio, hay moneda. "desde 500" sin moneda no significa nada.
  CONSTRAINT "project_brief_moneda_chk"
    CHECK (("precio_min" IS NULL AND "precio_max" IS NULL) OR "moneda" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "project_brief_org_idx" ON "project_brief" ("org_id");

-- ---------------------------------------------------------------------------
-- 2. Señales de mercado. El corazón del motor y de la regla "todo número con
--    fecha, fuente, muestra y método".
--
--    La regla NO vive solo en una prueba: vive en los CHECK de esta tabla. Un
--    número sin fuente, sin fecha o sin método no se puede INSERTAR. Así el
--    arnés de la aceptación 3 tiene respaldo en la base y no solo en el código
--    que se puede olvidar de llamarlo.
--
--    `hueco = true` es el otro estado honesto: no hay dato, se dice, y
--    `como_medirlo` propone la vía. Un hueco no lleva valor ni fuente, pero SÍ
--    lleva la propuesta de medición — si no, es un encogimiento de hombros.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "market_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  -- Qué se midió. `clave` es estable y sirve para comparar en el tiempo;
  -- `etiqueta` es para la pantalla, en español y sin jerga.
  "tema" text NOT NULL,
  "clave" text NOT NULL,
  "etiqueta" text NOT NULL,
  "pregunta" text,

  -- El valor. Uno de los dos, o ninguno si es hueco.
  "valor_num" numeric(18,4),
  "valor_texto" text,
  "unidad" text,

  -- La procedencia. Va PEGADA al dato, nunca en otra tabla ni en un comentario.
  -- fuente_tipo ordena el peso: una medición propia no vale lo mismo que el blog
  -- de una agencia, y la pantalla tiene que poder decir cuál es cuál.
  "fuente_tipo" text,
  "fuente_nombre" text,
  "fuente_url" text,
  "medido_en" timestamptz,
  "muestra" integer,
  "muestra_de" integer,
  "metodo" text,

  -- Calidad del dato, la calcula el CÓDIGO (no el modelo) a partir de
  -- fuente_tipo + muestra + antigüedad. Patrón de langchain-ai/paid-media-agent
  -- (Apache-2.0): banderas de calidad junto a la cifra.
  "calidad" text NOT NULL DEFAULT 'baja',
  "calidad_motivo" text,

  -- El hueco declarado.
  "hueco" boolean NOT NULL DEFAULT false,
  "como_medirlo" text,

  -- Lo crudo, para poder reauditar la cifra sin volver a salir a la red.
  "crudo" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "radar_run_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "market_signals_fuente_tipo_chk"
    CHECK ("fuente_tipo" IS NULL OR "fuente_tipo" IN
      ('medicion_propia', 'oficial', 'plataforma', 'prensa', 'blog', 'modelo')),
  CONSTRAINT "market_signals_calidad_chk"
    CHECK ("calidad" IN ('alta', 'media', 'baja')),

  -- EL CANDADO. Un dato con valor obliga a fuente + fecha + método.
  CONSTRAINT "market_signals_con_fuente_chk" CHECK (
    "hueco" = true
    OR (
      ("valor_num" IS NOT NULL OR "valor_texto" IS NOT NULL)
      AND "fuente_tipo"   IS NOT NULL
      AND "fuente_nombre" IS NOT NULL AND length(btrim("fuente_nombre")) > 0
      AND "medido_en"     IS NOT NULL
      AND "metodo"        IS NOT NULL AND length(btrim("metodo")) > 0
    )
  ),
  -- El otro lado: un hueco no trae valor, y sí trae cómo medirlo.
  CONSTRAINT "market_signals_hueco_chk" CHECK (
    "hueco" = false
    OR (
      "valor_num" IS NULL AND "valor_texto" IS NULL
      AND "como_medirlo" IS NOT NULL AND length(btrim("como_medirlo")) > 0
    )
  ),
  -- Un porcentaje de una muestra de cero no es un porcentaje.
  CONSTRAINT "market_signals_muestra_chk"
    CHECK ("muestra" IS NULL OR "muestra" > 0),
  CONSTRAINT "market_signals_muestra_de_chk"
    CHECK ("muestra_de" IS NULL OR "muestra" IS NULL OR "muestra" <= "muestra_de")
);

CREATE INDEX IF NOT EXISTS "market_signals_project_idx"
  ON "market_signals" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "market_signals_clave_idx"
  ON "market_signals" ("project_id", "clave", "medido_en" DESC);
CREATE INDEX IF NOT EXISTS "market_signals_tema_idx"
  ON "market_signals" ("project_id", "tema");
CREATE INDEX IF NOT EXISTS "market_signals_hueco_idx"
  ON "market_signals" ("project_id") WHERE "hueco" = true;

-- ---------------------------------------------------------------------------
-- 3. Corridas del radar. Lo que corre con navegador vive como worker en `motor/`
--    y escribe aquí; la app en Vercel solo LEE. Sin este registro, la pantalla no
--    puede decir "medido el 30-sep por el radar" ni qué consulta se negó.
--
--    `negadas` es tan importante como `hallazgos`: que Freelancer.com.mx fallara
--    por certificado es información, no un renglón que se borra.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "radar_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL,
  "estado" text NOT NULL DEFAULT 'corriendo',
  "worker" text,
  "consultas" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "negadas" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "hallazgos" integer NOT NULL DEFAULT 0,
  "huecos" integer NOT NULL DEFAULT 0,
  "error" text,
  "iniciado_en" timestamptz NOT NULL DEFAULT now(),
  "terminado_en" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "radar_runs_estado_chk"
    CHECK ("estado" IN ('corriendo', 'listo', 'fallido', 'parcial'))
);

CREATE INDEX IF NOT EXISTS "radar_runs_project_idx"
  ON "radar_runs" ("project_id", "iniciado_en" DESC);

ALTER TABLE "market_signals"
  ADD CONSTRAINT "market_signals_radar_run_fk"
  FOREIGN KEY ("radar_run_id") REFERENCES "radar_runs"("id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Públicos: segmento → dolor → oferta → etapa.
--
--    `porque` es NOT NULL a propósito. Un público sin argumento es una suposición
--    con nombre bonito, y el issue pide estrategias ARGUMENTADAS. `evidencia`
--    lista los ids de market_signals que lo sostienen; si viene vacío, la
--    pantalla lo marca como propuesta del modelo sin medición detrás.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audiences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  "nombre" text NOT NULL,
  "segmento" text NOT NULL,
  "dolor" text NOT NULL,
  "oferta" text NOT NULL,
  "etapa" text NOT NULL,

  "porque" text NOT NULL,
  "evidencia" jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Tamaño estimado. Si se puso un número, tiene que apuntar a la señal que lo
  -- respalda: el mismo candado de market_signals, un nivel arriba.
  "tamano_estimado" integer,
  "tamano_senal_id" uuid REFERENCES "market_signals"("id") ON DELETE SET NULL,

  "prioridad" integer NOT NULL DEFAULT 5,
  "estado" text NOT NULL DEFAULT 'propuesto',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "audiences_etapa_chk"
    CHECK ("etapa" IN ('descubre', 'compara', 'compra', 'ya_te_busco')),
  CONSTRAINT "audiences_estado_chk"
    CHECK ("estado" IN ('propuesto', 'aprobado', 'descartado')),
  CONSTRAINT "audiences_tamano_chk"
    CHECK ("tamano_estimado" IS NULL OR "tamano_senal_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "audiences_project_idx"
  ON "audiences" ("project_id", "prioridad");
CREATE INDEX IF NOT EXISTS "audiences_etapa_idx"
  ON "audiences" ("project_id", "etapa");

-- ---------------------------------------------------------------------------
-- 5. Plan por red: red ↔ público ↔ objetivo ↔ métrica.
--
--    `metrica` y `porque` son NOT NULL: una fila del plan sin métrica no se puede
--    evaluar nunca, y sin porqué no se le puede enseñar al dueño.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "channel_plan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  "red" text NOT NULL,
  "audience_id" uuid REFERENCES "audiences"("id") ON DELETE CASCADE,

  "objetivo" text NOT NULL,
  "metrica" text NOT NULL,
  "meta_valor" numeric(18,4),
  "meta_unidad" text,

  "formato" text,
  "frecuencia_semanal" numeric(6,2),

  "porque" text NOT NULL,
  "evidencia" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Qué regla de specs/social-playbooks se aplicó. Para que la pantalla cite la
  -- regla vigente de la red y no una costumbre de la casa.
  "reglas_aplicadas" jsonb NOT NULL DEFAULT '[]'::jsonb,

  "estado" text NOT NULL DEFAULT 'propuesto',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "channel_plan_objetivo_chk"
    CHECK ("objetivo" IN ('descubrimiento', 'consideracion', 'conversion', 'retencion')),
  CONSTRAINT "channel_plan_estado_chk"
    CHECK ("estado" IN ('propuesto', 'aprobado', 'descartado', 'pausado')),
  CONSTRAINT "channel_plan_frecuencia_chk"
    CHECK ("frecuencia_semanal" IS NULL OR "frecuencia_semanal" > 0)
);

CREATE INDEX IF NOT EXISTS "channel_plan_project_idx"
  ON "channel_plan" ("project_id", "red");
CREATE INDEX IF NOT EXISTS "channel_plan_audience_idx"
  ON "channel_plan" ("audience_id");

-- ---------------------------------------------------------------------------
-- 6. Hipótesis por publicación. "Cada publicación nace con su hipótesis y su
--    métrica" (principio 5). Sin esto no hay aprendizaje: hay historial.
--
--    El resultado lo escribe la MEDICIÓN (P1), nunca el modelo, y trae su fuente.
--    `veredicto` arranca en 'pendiente' y 'sin_datos' es un final legítimo:
--    LinkedIn hoy no devuelve métricas y decirlo es más honesto que estimarlas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "post_hypotheses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" text NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,

  "post_id" uuid REFERENCES "posts"("id") ON DELETE SET NULL,
  "piece_id" uuid REFERENCES "creative_pieces"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "channel_plan"("id") ON DELETE SET NULL,
  "audience_id" uuid REFERENCES "audiences"("id") ON DELETE SET NULL,

  "red" text NOT NULL,
  "hipotesis" text NOT NULL,
  "metrica" text NOT NULL,
  "meta_valor" numeric(18,4),
  "meta_unidad" text,

  -- El resultado, con su procedencia. Mismo criterio que market_signals.
  "resultado_valor" numeric(18,4),
  "resultado_en" timestamptz,
  "resultado_fuente" text,
  "resultado_metodo" text,

  "veredicto" text NOT NULL DEFAULT 'pendiente',
  "veredicto_porque" text,
  "leccion_id" uuid REFERENCES "lessons"("id") ON DELETE SET NULL,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "post_hypotheses_veredicto_chk"
    CHECK ("veredicto" IN ('pendiente', 'se_cumplio', 'no_se_cumplio', 'sin_datos')),
  -- Un resultado medido obliga a decir de dónde salió.
  CONSTRAINT "post_hypotheses_resultado_chk" CHECK (
    "resultado_valor" IS NULL
    OR ("resultado_en" IS NOT NULL AND "resultado_fuente" IS NOT NULL)
  ),
  -- Un veredicto resuelto obliga a tener el número que lo resolvió.
  CONSTRAINT "post_hypotheses_veredicto_con_dato_chk" CHECK (
    "veredicto" IN ('pendiente', 'sin_datos') OR "resultado_valor" IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS "post_hypotheses_project_idx"
  ON "post_hypotheses" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "post_hypotheses_post_idx"
  ON "post_hypotheses" ("post_id");
CREATE INDEX IF NOT EXISTS "post_hypotheses_veredicto_idx"
  ON "post_hypotheses" ("project_id", "veredicto");
CREATE INDEX IF NOT EXISTS "post_hypotheses_plan_idx"
  ON "post_hypotheses" ("plan_id");
