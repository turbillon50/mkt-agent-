-- ---------------------------------------------------------------------------
-- Corrida 8: el Asistente deja de ser un cajón con un cuadro de texto.
--
-- Tres tablas. Ninguna se parece a las otras en a quién pertenece ni en qué
-- pasa cuando se borra lo de al lado:
--
--   1. `assistant_conversations` — un hilo. Es de (organización, proyecto,
--      usuario). Hasta la corrida 7 el historial vivía en `chat_messages`,
--      que es por USUARIO y guarda el proyecto dentro del `metadata` jsonb:
--      pedirle "los hilos del proyecto X" a esa tabla es traerse los últimos
--      20 mensajes del usuario y filtrarlos en memoria. Con dos clientes y una
--      semana de uso, el Asistente del cliente B abría vacío porque los 20
--      últimos eran del A. Aquí el proyecto es COLUMNA y tiene índice.
--
--   2. `assistant_messages` — los mensajes de un hilo. Cuelgan del hilo con
--      ON DELETE CASCADE: un hilo borrado no deja mensajes huérfanos que nadie
--      puede volver a leer pero que se siguen pagando en disco.
--
--   3. `assistant_files` — los adjuntos. NO cuelgan del hilo con CASCADE, sino
--      con SET NULL. La diferencia importa: el archivo vive en un almacén de
--      afuera (Blob o el almacén de medios de la casa) y borrar la fila NO
--      borra el archivo. Si la fila desaparece con el hilo, el archivo queda
--      en el almacén sin nadie que sepa que existe — basura que se paga para
--      siempre. Con SET NULL el archivo sigue siendo del proyecto, se puede
--      listar y se puede barrer.
--
-- Todo es `IF NOT EXISTS`: se puede volver a correr sin miedo.
-- ---------------------------------------------------------------------------

-- 1. Los hilos ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       text NOT NULL,
  -- Los proyectos son filas de `campaigns` (así nacieron en la corrida 3 y así
  -- siguen). Borrado el proyecto, se va su historial: no hay a qué volver.
  project_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- El título lo escribe la app con las primeras palabras del primer mensaje.
  -- Nullable porque un hilo existe desde que se abre, antes de que alguien
  -- escriba nada, y ponerle "Nueva conversación" en la base sería guardar una
  -- etiqueta de la interfaz dentro del dato.
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Se mueve con cada mensaje. Es por lo que se ordena la lista: un hilo de
  -- hace un mes al que le escribiste hace un minuto es el de hace un minuto.
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- El índice que manda: "los hilos de ESTE proyecto para ESTA persona, los más
-- recientes primero". Es literalmente la consulta del botón de historial.
CREATE INDEX IF NOT EXISTS assistant_conversations_proyecto_idx
  ON assistant_conversations (project_id, user_id, updated_at DESC);

-- 2. Los mensajes ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assistant_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  org_id          text NOT NULL,
  project_id      uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- 'user' | 'assistant'
  role            text NOT NULL,
  content         text NOT NULL,
  -- Lo que no es texto y hay que volver a pintar al recargar: las piezas que
  -- salieron, la URL de lo que se publicó, los adjuntos de ese turno y las
  -- menciones que traía. Va en jsonb porque cada tipo de respuesta rica lleva
  -- una forma distinta y tres columnas nullables no lo cubrirían.
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_hilo_idx
  ON assistant_messages (conversation_id, created_at);

-- 3. Los adjuntos ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assistant_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          text NOT NULL,
  project_id      uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES assistant_conversations(id) ON DELETE SET NULL,
  -- Cómo se llamaba el archivo en la máquina de quien lo subió. Se enseña en
  -- el chip y se le dice al modelo: "el PDF" no sirve cuando hay tres.
  name            text NOT NULL,
  url             text NOT NULL,
  mime            text NOT NULL,
  size            bigint NOT NULL,
  -- 'blob' | 'casa' — dónde quedaron los bytes. Sin esto, el día que se cambie
  -- de almacén no hay forma de saber cuáles URLs siguen vivas.
  storage         text NOT NULL DEFAULT 'casa',
  -- 'pendiente' | 'leido' | 'sin-lector' | 'error'
  extract_status  text NOT NULL DEFAULT 'pendiente',
  -- Lo que Goossip pudo LEER del archivo. Es la razón de ser de la tabla: un
  -- PDF de 40 páginas se lee UNA vez y se guarda; releerlo en cada turno de la
  -- conversación es pagar el mismo trabajo cinco veces y tardar cinco veces
  -- más en contestar.
  extracted_text  text,
  -- Por qué no se pudo leer, en español, para poder decírselo al usuario en
  -- vez de dejar el chip en gris sin explicación.
  extract_note    text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_files_proyecto_idx
  ON assistant_files (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_files_hilo_idx
  ON assistant_files (conversation_id);

-- 4. Las preferencias de interfaz del usuario ---------------------------------
--
-- `users` tenía `metadata`, que es el espejo de lo que manda Clerk. Meter ahí
-- el ancho del panel mezcla dos cosas con dueños distintos: una la escribe el
-- webhook de Clerk y la otra la escribe la persona arrastrando un borde. El día
-- que el webhook reescriba `metadata` entero —que es lo que hacen los espejos—
-- el panel volvería a 360 px sin que nadie sepa por qué.
--
-- `organizations` ya tenía su `settings` con este mismo nombre y este mismo
-- propósito. Esto es el de la persona.
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
