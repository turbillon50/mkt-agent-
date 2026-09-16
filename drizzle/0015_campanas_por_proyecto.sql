-- ---------------------------------------------------------------------------
-- 0015 — Campañas EN PLURAL: un proyecto tiene muchas campañas.
--
-- Hasta aquí "campaña" tenía dos significados peleados entre sí:
--   · la tabla `campaigns`, que por historia del repo ES el proyecto (0012);
--   · la palabra que usa quien vende: la pauta concreta que trae gente.
--
-- Esta migración le da cuerpo al segundo. `campaigns` se queda como está —
-- renombrarla pediría tocar doce llaves foráneas en una base de producción y
-- no compra nada; en la app se llama PROYECTO en todos lados. Lo nuevo es
-- `marketing_campaigns`, que cuelga del proyecto, y la columna que permite
-- decir de QUÉ campaña vino cada lead.
--
-- `sales_leads.campaign_id` NO se toca: sigue siendo el proyecto, notNull, con
-- sus doce índices y sus rutas vivas. La atribución por campaña viaja en una
-- columna aparte, `marketing_campaign_id`, nullable a propósito: un lead que
-- entra por el formulario del sitio no viene de ninguna pauta, y forzarlo a
-- una campaña inventada sería mentir en el reporte.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      text NOT NULL,
  project_id  uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name        text NOT NULL,
  -- leads | mensajes | trafico | alcance | ventas
  objective   text NOT NULL DEFAULT 'leads',
  -- borrador | activa | pausada | terminada
  status      text NOT NULL DEFAULT 'borrador',
  -- Los canales donde corre, del mismo catálogo que Conexiones: ["meta", …].
  channels    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Presupuesto total de la campaña. numeric y no float: el dinero no se
  -- redondea solo. Nullable porque hay campañas orgánicas sin un peso detrás.
  budget      numeric(12, 2),
  -- Lo que amarra la campaña con Meta: página, formularios de lead ads, ad set.
  -- jsonb y no columnas porque cada canal trae identificadores distintos y
  -- inventarle una columna a cada uno deja la tabla llena de nulos.
  meta_refs   jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_project_idx
  ON marketing_campaigns (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_org_idx
  ON marketing_campaigns (org_id);
CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx
  ON marketing_campaigns (project_id, status);

-- Dos campañas con el mismo nombre en el mismo proyecto son un error de dedo,
-- no un caso de uso: el reporte de "cuántos leads trajo X" quedaría partido en
-- dos para siempre. `lower()` porque "Verano 2026" y "verano 2026" son la
-- misma para quien la dio de alta.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_project_name_uniq
  ON marketing_campaigns (project_id, lower(name));

-- --- atribución del lead -----------------------------------------------------
-- ON DELETE SET NULL y no CASCADE: borrar una campaña no puede llevarse los
-- leads que trajo. El lead es del proyecto; la campaña solo dice de dónde vino.

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid
  REFERENCES marketing_campaigns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_leads_marketing_campaign_idx
  ON sales_leads (marketing_campaign_id)
  WHERE marketing_campaign_id IS NOT NULL;
