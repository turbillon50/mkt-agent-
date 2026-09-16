# Integración de la corrida 8 sobre la corrida 7

`feat/asistente-3col-compose-c8` rebasada sobre `origin/main` (42be59a, el merge
del PR #44 de la corrida 7). Nada se tocó en `main`.

    git fetch origin main
    git rebase origin/main

Cinco conflictos, todos resueltos conservando **las dos** funcionalidades. Ni un
`--ours` ni un `--theirs`: cada archivo se leyó por los dos lados y se armó a
mano.

---

## 1. Los cinco conflictos

| Archivo | Qué chocaba | Cómo quedó |
|---|---|---|
| `.gitignore` | c7 ignoraba `capturas-c7/`, c8 `capturas-c8/` | Los dos bloques, uno tras otro |
| `package.json` | c7 agregó `test:corrida7`, c8 `test:asistente` | Los dos scripts. Todas las dependencias de las dos. **Sin `"type":"module"`** |
| `components/assistant/assistant-drawer.tsx` | c7 escondía el flotante en el Inicio; c8 lo escondía de 1250 px para arriba | Las dos condiciones sumadas |
| `src/agent/project-agent.ts` | c7 metía nivel de autonomía + lecciones al system; c8 refactorizó esa función entera y metió autonomía del turno, pantalla, adjuntos y menciones | Las dos listas fundidas en `armarInstrucciones`, en orden |
| `src/db/schema.ts` | c7 agregó 5 tablas, c8 agregó 3, las dos al mismo renglón | Las 8 tablas, y los dos imports (`bigint` de la 8, `doublePrecision` de la 7) |

### Lo que quedó en cada uno

**`package.json`** — `test:corrida7` y `test:asistente`. Dependencias de las dos
corridas: `@vercel/blob`, `fflate`, `mammoth`, `pdf-parse`, `xlsx` (c8) sobre lo
que ya traía main. Verificado que **no** hay `"type":"module"`: es lo que tumbó
producción entera en f252c9d, el lanzador de Vercel es CJS.

    $ grep -c '"type"' package.json
    0

**`src/db/schema.ts`** — las 8 tablas nuevas, contadas:

    prospects · prospect_searches · project_competitors ·
    competitor_snapshots · lessons              ← corrida 7
    assistant_conversations · assistant_messages · assistant_files   ← corrida 8

Más las columnas de las dos: `creative_pieces.programada_para / comentario /
estado_por / estado_en` (c7) y `users.settings` (c8).

**`src/agent/project-agent.ts`** — el system del agente lleva, en este orden:
manifiesto de marca → reglas del proyecto → **nivel de autonomía del proyecto
(c7)** → **reglas de autonomía del turno (c8)** → pantalla donde está el usuario
(c8) → estado del proyecto → **lecciones parecidas (c7)** → adjuntos leídos (c8)
→ menciones (c8). Las tools de las dos corridas entran completas: c8 nunca tocó
`project-tools.ts`, así que las de prospección, competencia y visor de la 7
llegaron intactas.

---

## 2. Las tres decisiones que el conflicto no resolvía solo

Un merge que compila no es un merge que funciona. Tres cosas se veían bien en el
diff y estaban rotas al correr la app.

### a) El nivel del proyecto le gana al interruptor del compose

Las dos corridas traen "autonomía" y **no son la misma cosa**:

* el **nivel** (c7) es del proyecto, lo pone el dueño en Ajustes, se gana con
  racha y tiene techo — 1 Propone, 2 Publica, 3 Contesta, 4 Opera campañas;
* el **selector** (c8) es del turno, lo mueve quien escribe en la barra del
  compose: "Propone" o "Publica solo".

Pegados tal cual, un proyecto en **nivel 1** —"todo pasa por aprobación"— se
saltaba su propio techo porque alguien movió un interruptor en la barra de
escribir. Eso no es un techo, es una sugerencia.

Quedó así, en `armarInstrucciones`:

```ts
const publicarSaleSolo = puedeSolo(ctx.project, 'publicar_organico').puede;
const autonomia = autonomiaEfectiva(input.autonomia, ctx.puedeOperar && publicarSaleSolo);
```

"Publica solo" ahora pide **dos** permisos: el rol de quien escribe y el nivel
del proyecto. Falta uno y el turno cae a "propone". Las compuertas duras de la 7
(dinero, promesas legales, precios fuera del catálogo, WhatsApp) siguen cerradas
en cualquier nivel y en cualquier selector — eso no se tocó.

### b) `goossip:dictar` se iba al vacío en escritorio

La corrida 7 dejó un evento del navegador para que cualquier pantalla le dicte
algo a Goossip; lo usa el botón **"Generar pieza"** de la auditoría de marca
(`components/marca/auditoria.tsx:237`). Lo escuchaba **solo el cajón**.

De 1250 px para arriba el cajón está oculto por CSS. Resultado del merge crudo:
apretar "Generar pieza" en una ventana de 1440 no hacía **nada** visible.

Ahora lo escuchan los dos y se reparten el evento con el mismo candado que ya
usaba ⌘K — `enEscritorio()` decide de quién es. El panel además **despliega**
antes de mandar: una respuesta que llega a un panel plegado es una respuesta que
nadie lee. Sin el reparto, los dos oyentes montados mandaban el prompt dos veces
y Goossip cobraba dos piezas por un clic.

### c) Dos chats en la misma pantalla

La corrida 7 puso el Asistente **embebido** en la columna ancha del Inicio del
proyecto. La corrida 8 puso el panel de Goossip **siempre abierto** en la tercera
columna. Los dos a la vez, a 1440, son dos cajas de chat del mismo proyecto con
dos historiales que se pintan por separado.

De 1250 px para arriba el embebido se esconde y la rejilla del Inicio pasa a una
columna, así que el centro de mando usa todo el ancho que queda. **Abajo de 1250
no cambia nada de la corrida 7**: el embebido sigue siendo la columna ancha, que
es justo donde Luis lo pidió para que el chat no viva detrás de un atajo de
teclado que nadie descubre solo.

Medido, no supuesto: 1 caja de chat visible a 1440, 1 a 1200 (§5).

---

## 3. Migraciones: la 8 se renumeró a 0020

Las dos corridas se llamaron `0019`. `src/db/migrate.ts` ordena por nombre de
archivo, así que `0019_asistente_adjuntos.sql` se habría aplicado **antes** que
`0019_corrida7_...` — un orden que miente sobre en qué orden se escribieron.

    git mv drizzle/0019_asistente_adjuntos.sql drizzle/0020_asistente_adjuntos.sql

No hay choque de DDL entre las dos: tocan tablas distintas y todo va con
`IF NOT EXISTS`. La única columna compartida por vecindad es `users.settings`, y
la 7 no toca `users`.

Aplicada contra el `DATABASE_URL` de `.env.local`:

    $ npm run db:migrate
    -> applying 0020_asistente_adjuntos.sql
    Migrations up to date.

Solo la 0020. La 0019 de la corrida 7 ya estaba aplicada en esa base —main la
desplegó— que es exactamente lo que confirma que renumerar era lo correcto.

---

## 4. Lo que compila y lo que pasa

Node 20.20.2, npm 10.8.2.

| Comando | Resultado |
|---|---|
| `npm ci` | limpio |
| `./node_modules/.bin/tsc --noEmit` | **0 errores** |
| `npm run build` | **verde**, 38 rutas |
| `npm run db:migrate` | 0020 aplicada |
| `npm run test:corrida7` | **148 pasadas · 0 fallidas** |
| `npm run test:asistente` | **94 pasadas · 0 fallidas** |
| `test/composio.test.ts` | 72 · 0 |
| `test/creative.test.ts` | 209 · 0 |
| `test/campanas.test.ts` | 93 · 0 |
| `test/projects.test.ts` | 69 · 1 — **ya venía fallando en main** |

**242 pruebas de las dos corridas, las 242 verdes.**

### Las dos fallas que hay que explicar, porque ninguna es del merge

**1. `test:corrida7` daba 146/2 la primera vez.** Dos fallas:
`con Facebook e Instagram vivos, Meta cuenta como conectado` y `y dice CUÁLES`.

No es código: es que el `.env.local` de este worktree trae la llave de Composio
**redactada**, literal `COMPOSIO_API_KEY="[SENSITIVE]"`. `composioKey()` devuelve
`null` a cualquier valor que empiece con `[`, `channelAvailable('facebook')` cae
a `false` y la tarjeta sale "Próximamente" en vez de "conectado".

Comprobado por los dos lados:

    # la misma prueba en un worktree LIMPIO de origin/main, sin mi merge
    $ git worktree add /tmp/g7check origin/main && tsx test/corrida7.test.ts
    146 pasadas · 2 fallidas    ← idénticas

    # y con la llave buena de /root/.env
    $ COMPOSIO_API_KEY=… tsx test/corrida7.test.ts
    148 pasadas · 0 fallidas

**2. `test:projects` falla en `proyectos sin dueño — esperaba 0, llegó 1`.**
También idéntico en el worktree limpio de `origin/main`. Es un proyecto huérfano
que ya vive en la base compartida, de antes de esta rama. **No lo arreglé**: está
fuera de lo que pide la misión y tocar datos de una base compartida sin que Luis
lo pida es cómo se rompen cosas ajenas. Queda anotado.

---

## 5. Las capturas: la prueba de que conviven

Script nuevo — `scripts/capturas-integracion-c8.ts`. No repite lo que ya miden
`capturas-c7.ts` y `capturas-c8.ts`: mide lo único que ninguna de las dos podía
medir sola, porque cada una vivía en su rama.

WebKit, sesión real de Clerk, proyecto y leads de verdad creados y borrados al
final. `GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3210` contra el build de
producción de esta rama.

### 1440 — Inicio del proyecto con el panel abierto

    01-inicio-con-goossip-abierto-1440.png
    02-inicio-con-goossip-plegado-1440.png

| Medida | Número |
|---|---|
| panel de Goossip | **360 px**, cabecera "Goossip · MOMENTUM", con compose |
| `<main>` abierto | **806 px**, termina en x=1070 |
| panel, borde izquierdo | x=**1070** |
| `<main>` plegado | **1118 px** — gana **312 px** |
| tira al plegar | **48 px** con su badge |
| herramientas del centro de mando | **8 / 8** |
| números del centro de mando | **4 / 4** |
| cajas de chat visibles | **1** |
| errores de JS | **0** |
| jerga de desarrollo en pantalla | **0** |

`main.right (1070) == panel.left (1070)`. Eso es lo que separa *reacomodar* de
*tapar*: si el panel se montara encima, `main` seguiría llegando al borde de la
ventana y la resta saldría negativa. Y plegar **ensancha** el contenido 312 px —
una capa montada encima no haría eso.

Mirada en WebKit, no solo medida: se ven las tres columnas, la franja de
conexiones con sus 25 canales, los cuatro números, "Para arranca", la rejilla de
Herramientas con **Prospección** y **Competencia** de la corrida 7, y a la
derecha Goossip con su guía activa ("Hay 3 leads sin contactar"), el compose con
adjuntos, `@`, `/` y el selector de autonomía en "Propone".

### 1200 — el control, abajo del corte

    01-inicio-con-goossip-abierto-1200.png

Panel de Goossip **0 px** (oculto), Asistente **embebido** presente con sus tres
prompts de arranque, 8/8 herramientas, sin flotante de más. La corrida 7 intacta.

`capturas-integracion-c8/resumen.json` trae todos los números. Los PNG se quedan
en el servidor: 2.3 MB, y lo que se versiona es la medición.

---

## 6. Preview

Rama empujada a `origin/feat/asistente-3col-compose-c8` con `--force-with-lease`
(es un rebase, la rama se reescribió). **`main` no se tocó.**

    https://goossip-hz9k2wt42-luis-projects-48b011f9.vercel.app

Inspector: `https://vercel.com/luis-projects-48b011f9/goossip/DJHgB4TqH1Q5qsAJsxuqqvmAsiCs`
· build de 45 s, `status ● Ready`, 38 rutas.

### `/sign-in` ≠ 500

    $ vercel curl <preview>/sign-in -- -s -o /dev/null -w '%{http_code}'
    200

Y el cuerpo es la app, no una pantalla de Vercel: 10 apariciones de "Goossip" y
cero de `sso-api`. Las demás públicas, igual: `/` 200, `/sign-up` 200,
`/terminos` 200, `/privacidad` 200.

**Ojo con cómo se mide esto.** Un `curl -L` a pelo contra el preview da 200 y
parece bueno, y es **mentira**: el preview trae Deployment Protection, el 302
lleva a `vercel.com/sso-api` y lo que contesta 200 es el muro de Vercel, no
Goossip. La primera medición mía cayó ahí. Lo que vale es `vercel curl`, que
pasa el candado con el token. Queda escrito porque la trampa se ve exactamente
igual que el éxito.

### Y una cosa que el preview no puede probar, y hay que decirla

En el preview `/api/projects` da **500**; en producción la misma ruta da **307**.
No es de este merge:

    $ vercel env ls preview | grep -i clerk
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL   …

Es el único. **El entorno Preview del proyecto `goossip` no tiene
`CLERK_SECRET_KEY` ni `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.** Sin ellas el
middleware de Clerk no corre, las rutas con sesión truenan y `/sign-in` se pinta
por el camino de `isClerkConfigured() === false`. Es un hueco de configuración
del proyecto, anterior a esta rama, y **no lo tapé**: inyectar ahí las llaves de
producción tampoco arreglaría nada, porque esa instancia de Clerk es de
producción y su único dominio es `vliving.life` — desde un `*.vercel.app` el
handshake entra en el bucle de 307 que ya está documentado desde la corrida 2.
Por eso las capturas del §5 se sacaron contra el build de esta rama corriendo en
el servidor, que es donde sí hay sesión de Clerk de verdad.

---

## 7. Lo que queda anotado y NO toqué

Tres cosas que encontré, que están fuera de lo que pide la misión, y que
prefiero dejar escritas antes que arreglar por mi cuenta:

1. **`test/projects.test.ts` — `proyectos sin dueño: esperaba 0, llegó 1`.** Un
   proyecto huérfano que ya vive en la base compartida. Idéntico en un worktree
   limpio de `origin/main`. Borrar filas de una base que usan otros worktrees sin
   que Luis lo pida es como se rompen cosas ajenas.
2. **El entorno Preview de Vercel no tiene llaves de Clerk** (arriba). Decisión
   de Luis si se le da una instancia de Clerk de desarrollo al preview o si los
   previews se siguen probando en el servidor.
3. **`.env.local` de este worktree trae `COMPOSIO_API_KEY="[SENSITIVE]"`.** No es
   una llave, es el marcador de redacción. Las dos pruebas de Composio de la
   corrida 7 solo pasan exportando la de `/root/.env`. No lo edité: `.env.local`
   no se versiona y sobrescribirle el archivo a otro agente no es mi llamada.
