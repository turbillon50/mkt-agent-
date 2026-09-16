-- ---------------------------------------------------------------------------
-- Corrida 6, segunda parte: la publicación también es DEL PROYECTO.
--
-- Va en su propio archivo y no dentro de la 0017 por una razón que costó un
-- rato descubrir: el corredor de migraciones lleva la cuenta por NOMBRE DE
-- ARCHIVO, no por contenido. Una vez que `0017` quedó registrada, agregarle
-- líneas al final no vuelve a correrla — la migración se aplica "bien" y la
-- columna no existe. Medido el 16-sep-2026: `npm run db:migrate` contestó
-- "Migrations up to date" con `posts.project_id` sin crear.
--
-- Regla que queda escrita: una migración ya aplicada no se edita. Se hace otra.
-- ---------------------------------------------------------------------------

-- 4. La publicación también es DEL PROYECTO --------------------------------
--
-- `posts` solo tenía `org_id`. Con un proyecto por organización daba igual;
-- con tres clientes en la misma agencia, la sección Contenido del cliente A le
-- enseñaba lo publicado del cliente B. Nullable porque las publicaciones
-- viejas no saben de qué proyecto salieron y adivinárselo sería inventar.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_project_idx ON posts (project_id, created_at DESC);
