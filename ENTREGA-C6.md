# GOOSSIP CORRIDA 6 — PIEZAS + MEMORIA DE DISEÑO + ASISTENTE POR PROYECTO

```
GOOSSIP CORRIDA 6 — PIEZAS + MEMORIA DE DISEÑO + ASISTENTE POR PROYECTO
Memoria de diseño: archivos 95 · chunks 1748 (de 319 fuentes) · specs por red: 8 redes, 24 formatos, cada uno con URL oficial y fecha
Kit de marca: OK · proyectos con kit: 1 (MOMENTUM, paleta propuesta por Gemini desde su logo real)
Motor de piezas: Gemini OK (3 opciones en 12 s, 1080×1350 exactos) · Canva escrito y probado hasta donde se puede sin cuenta conectada → fallback sharp, que es el que corrió · Higgsfield OK (API viva, 948 créditos, job real completado)
Asistente por proyecto: OK · publicó en LinkedIn de MOMENTUM: https://www.linkedin.com/feed/update/urn:li:share:7505932791906299904/
Guía activa: reglas 6
Deploy preview: READY — https://goossip-6feb0ix4w-luis-projects-48b011f9.vercel.app · PR: #41
Bloqueos de Luis: [borrar a mano un post de prueba que salió durante el diagnóstico de LinkedIn — la conexión no tiene permiso para listarlos y borrarlo | conectar Canva en MOMENTUM y cargarle una plantilla de marca, o el motor seguirá componiendo por su cuenta | decidir si HIGGSFIELD_ACCESS_TOKEN entra al entorno de Vercel: hoy la app no lo tiene y foto de producto/video quedan apagados en producción | correr `npm run db:migrate` contra producción al mergear (0017 y 0018) y después `npm run ingest:diseno` | CLERK_SECRET_KEY y las NEXT_PUBLIC_CLERK_* siguen fuera del entorno Preview desde la corrida 5]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Memoria de diseño — ingesta | `npm run ingest:diseno` | **319 fuentes · 1748 pedazos** con embeddings de 1024 (jina-embeddings-v3) |
| … de dónde salieron | el desglose del script | **95 archivos** de skills-vault · **24** formatos oficiales por red · **200** memorias del Brain |
| … por categoría | `contarDiseno()` | higgsfield 1092 · brain 574 · diseño 44 · spec-red 24 · marca 14 |
| **Idempotencia (prueba 4 del issue)** | correrla otra vez | **0 nuevos, 0 pedazos escritos, 0 embeddings pedidos** · 319 fuentes sin cambio |
| Resistencia a caídas | la primera corrida murió con un 429 del proveedor de embeddings | la segunda retomó donde se quedó: **62 fuentes ya estaban** y solo se pagaron las 257 que faltaban |
| Specs por red | `src/creative/specs.ts` + la prueba que las revisa una por una | **8 redes · 24 formatos** · **24/24** con URL oficial y fecha de lectura |
| **Pregunta 3 del issue** | "¿qué medidas lleva un reel?" por la herramienta del Asistente | "Instagram — reel: **1080 × 1920 px (9:16)**… zona segura: 269 px arriba, 672 abajo, 65 a cada lado. **Fuente:** developers.facebook.com/… (leída el 2026-09-16)" |
| … y por la memoria vectorial | `buscarDiseno()` | acierta la spec del reel con **parecido 0.850**, y su `source_path` **es la URL oficial** |
| Kit de marca — alta guiada | logo real de `vmomentum.site/brand/mark.png` → Gemini Vision | propuso **5 colores con rol**, 2 tipografías, tono y palabras prohibidas |
| **Pieza para Instagram (prueba 2)** | `generarPiezas` con el kit de MOMENTUM | **3 opciones en 12 s**, ángulos distintos, con logo y paleta |
| … medidas de verdad | bajadas y medidas con sharp | **1080 × 1350** las tres · 148 KB, 153 KB y 84 KB · JPEG, que es lo único que traga la API de Instagram |
| … y miradas | las tres, a tamaño real | logo arriba a la izquierda, titular legible sobre velo degradado, botón en el azul de la marca |
| **Publicar en LinkedIn (prueba 1)** | el Asistente de MOMENTUM, de verdad | **publicado** · https://www.linkedin.com/feed/update/urn:li:share:7505932791906299904/ |
| … con qué cuenta | `activeAccountFor(project,'linkedin')` | `ca_r3rBMSU-_qFo` con **`user_id = project:5cf4d33c-…`** — la del PROYECTO |
| … verificado en la web | WebKit contra la URL publicada | **HTTP 200** y el texto publicado aparece en la página |
| **Prueba 1, segunda mitad** | el mismo Asistente desde el proyecto GOOSSIP | *"GOOSSIP no tiene LinkedIn conectado. Dile al usuario que entre a Conexiones del proyecto y lo conecte"* — no lo intenta por otro lado |
| Higgsfield | `POST /agents/jobs` → `GET /agents/jobs/{id}` | trabajo real **completado** con URL de resultado · 117 modelos en el catálogo · **948.87 créditos** |
| Canva | `GET /api/v3/tools?toolkit_slug=canva` | **32 tools**, auth administrada `OAUTH2` · el camino de autofill está escrito con los slugs reales; sin cuenta conectada el motor cae al compositor propio **y lo dice** |
| Guía activa | `pendientesDelProyecto()` en un proyecto nuevo y en uno al día | **6 reglas** · el nuevo saca 3 sugerencias, todas con botón; el que ya tiene marca **deja de pedirla** |
| Pruebas de la corrida 6 | `npm run test:creative` | **209 pasadas, 0 fallidas** |
| **Caso que DEBE fallar** | a mano: se le quitó la fuente a una spec y se rompió la regla de "reel" | **4 fallidas**, justo las que tocaban. Restaurado y verde otra vez |
| Pruebas de la corrida 5 | `npm run test:composio` | **72 pasadas, 0 fallidas** (con acción real: 3 bases de Airtable leídas, fila escrita y releída) |
| Pruebas de la corrida 4 | `npm run test:campanas` | **123 pasadas, 0 fallidas** |
| Pruebas de la corrida 3 | `npm run test:projects` | **99 pasadas, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` | **89 pasadas, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 6.2s` |
| UI | WebKit 1440×900 y 390×844, con sesión real de Clerk | **7 capturas** · **7 con HTTP 200** · **0 errores de JS** · **0 notas internas** |
| El Asistente, abierto de verdad | Ctrl+K sobre la pantalla de Leads | **abre**, trae **3 sugerencias con botón** ("Ver los leads", "Conectar un canal", "Ver las piezas"), **la pantalla de atrás sigue ahí** y **cierra con Escape** |
| **Deploy preview** | `vercel deploy` | **READY** — https://goossip-6feb0ix4w-luis-projects-48b011f9.vercel.app |

Las capturas viven en `capturas-c6/` del servidor. Lo que se versiona es
`capturas-c6/resumen.json`, que es la medición.

---

## A. La memoria de diseño

**Es de la APLICACIÓN, no de un cliente.** Cómo se diseña para Instagram es lo
mismo para el de tacos que para el desarrollador inmobiliario. Por eso
`design_knowledge` lleva `scope` y no `org_id`: la columna dice en voz alta que
este dato es global, y copiarlo por proyecto sería pagar el mismo embedding N
veces.

**La idempotencia es por hash del ARCHIVO COMPLETO, no del pedazo.** Es la
diferencia entre "la segunda corrida escribe 0" y "la segunda corrida compara
1748 hashes". Si el archivo no cambió, no se lee, no se parte y no se le pagan
embeddings a nadie. Y si un archivo SÍ cambió, sus pedazos viejos se BORRAN
antes de meter los nuevos: sumar dejaría huérfanos contestando cosas que ya no
están escritas en ningún lado.

**Se cayó a la mitad y por eso sabemos que se puede caer.** La primera ingesta
de verdad murió con un `429` del proveedor de embeddings a los 62 archivos.
Ahora hay tandas de 16, una pausa entre tandas y reintento con espera que se
duplica — y, sobre todo, cada fuente se confirma por separado, así que la
segunda corrida arrancó donde se quedó la primera.

## A2. Las medidas por red: buscadas, con fuente y con fecha

24 formatos de 8 redes. **Ningún número salió de la memoria de nadie**: cada uno
se leyó el 16-sep-2026 de la página que se cita, y la cita va pegada al número.
La prueba recorre los 24 y falla si a alguno le falta la URL o la fecha.

Tres páginas se negaron a que un programa las leyera, y se anota cuál:
`business.linkedin.com` contesta **HTTP 999** y `business.x.com` **HTTP 402**.
Para LinkedIn se usó su centro de ayuda (`linkedin.com/help/lms/…`), que sí
contesta y es de LinkedIn; para X, `docs.x.com`, que también es de X. **Ninguna
medida viene de un blog de terceros.**

Lo que el motor hace con ellas no es decorativo: **elige el lienzo ANTES de
pedirle nada a un modelo**. Gemini acepta una proporción pero no la respeta al
píxel —pidiéndole 4:5 devolvió 896 × 1152, que es 7:9— así que siempre se
recorta al tamaño exacto. La red sí cuenta los píxeles.

## B. El kit de marca

Una fila por proyecto. **Cada color lleva ROL**, no solo hex: al componer hay
que saber cuál va de fondo y cuál va en el botón, y una lista de seis hex sin
rol obliga a adivinar con la marca del cliente.

El alta es guiada y en ese orden porque es el orden en que la gente tiene las
cosas: **casi nadie tiene su manual de marca a la mano, pero todo el mundo tiene
su logo.** Se sube, Gemini lo MIRA —mirar, no deducir del nombre del negocio— y
propone. El usuario corrige y aprueba. **Nada se guarda solo**: mientras no
aprieten "Guardar el kit", la marca del proyecto no ha cambiado.

Y lo que no viene en un guardado **no se toca**. Una llamada parcial le borraba
al cliente su tono de voz y sus palabras prohibidas sin decir nada. Hay prueba.

## C. El motor de piezas

`brief → lienzo de la spec → imagen base con Gemini usando el kit → texto, logo
y CTA encima → 3 opciones`.

**Gemini hace el fondo; el texto lo pone el compositor.** Un modelo de imagen
escribe mal y a la tercera letra pone "OFERTTA". Pedirle que ponga el copy del
cliente es garantizar que la pieza no se pueda usar.

**Tres ÁNGULOS distintos, no tres versiones de lo mismo** (producto limpio /
persona en contexto / gráfico de marca). El issue manda "nunca una sola", y tres
variaciones del mismo encuadre no son opciones: son ruido.

**El compositor propio existe para que el motor sirva el PRIMER DÍA.** Un motor
que solo funciona con Canva conectado está apagado para el 100 % de los clientes
nuevos. Tres cosas que ahí no son adorno: el recorte al píxel exacto de la spec,
el titular colocado dentro de la zona segura, y el color del texto decidido
**midiendo el brillo** de la franja donde va a caer — no a ojo.

Cada pieza guarda su prompt completo, el modelo, el motor que la compuso y una
**foto del kit** de ese momento: si el cliente cambia su azul en noviembre, la
pieza de septiembre tiene que poder decir con qué azul se hizo.

## D. El Asistente es de un proyecto, y eso era el bug

El pendiente que dictó Luis. El chat era global: no sabía de qué cliente le
hablaban y publicaba con la cuenta de la casa.

**El `projectId` NO lo escribe el modelo.** El issue pide "tools con projectId
obligatorio", pero obligatorio en el esquema significa que el modelo lo tiene
que escribir — y un modelo que escribe un id puede escribir el del cliente de al
lado, y la tool lo obedecería. Aquí `toolsParaProyecto(ctx)` es una **fábrica**:
el proyecto viene cerrado dentro de cada herramienta, y es siempre aquel en el
que está parado el usuario, con el permiso ya revisado. Hay una prueba que
recorre las 13 tools y falla si alguna acepta un `projectId` de fuera.

**Lo que publicaba con cuentas de la casa se BORRÓ, no se apagó.** Se fueron las
tools `publish-post` y `send-whatsapp` del agente global y la mitad de
`publish-now` que daba al admin un atajo para publicar en la página de Goossip
desde cualquier proyecto. Una bandera apagada sigue siendo una bandera que
alguien enciende.

**El cron también.** `runOnce()` recorría `enabledPosters()` —las cuentas de la
casa— y publicaba con ellas. Ahora recorre PROYECTOS y publica con la cuenta de
cada uno. Un proyecto sin canales no publica y se dice por qué, en vez de caer
en la cuenta de la casa.

**El panel, no una pantalla.** Cajón a la derecha con ⌘K en las diez pantallas.
Preguntarle algo a Goossip mientras miras tus leads no debería costarte perder
de vista tus leads.

**La guía activa tiene tres reglas sobre las reglas**: cada sugerencia trae
ACCIÓN (sin botón no es sugerencia, es reproche), dice el COSTO y no el síntoma
("te falta conectar Facebook" no mueve a nadie; "sin eso no entran leads" sí), y
se ordenan por lo que cuesta ignorarlas.

---

## Tres bugs que solo se ven publicando de verdad

La publicación en LinkedIn falló **tres veces seguidas** antes de salir, y cada
fallo era un bug real que estaba en el código desde la corrida 5:

1. **`cuerpo()` no destapaba `response_dict`.** Solo conocía `response_data`.
   LinkedIn envuelve en el otro, así que `LINKEDIN_GET_MY_INFO` devolvía un
   objeto donde no estaba el autor y Goossip contestaba *"No se pudo leer tu
   identidad. Vuelve a conectarlo"* — mandando al usuario a reconectar una
   cuenta que estaba perfectamente conectada. Y el campo se llama `author_id`,
   que además ya viene con el prefijo `urn:li:person:`.

2. **La tool de Composio manda una versión de API caducada.**
   `LINKEDIN_CREATE_LINKED_IN_POST` declara un `LinkedIn-Version` de 2024 y
   LinkedIn contesta **426 NONEXISTENT_VERSION**. LinkedIn caduca sus versiones
   cada pocos meses. Publicar pasó a la llamada cruda por el proxy —la MISMA
   conexión del proyecto, el token nunca toca a Goossip— con la versión en
   `LINKEDIN_API_VERSION`. Es exactamente lo que ya se hacía con los formularios
   de lead ads de Facebook.

3. **El proxy se tragaba dos cosas.** Los errores que el proveedor manda con
   HTTP 200 del lado de Composio (el error viaja dentro, en `data.status`), y
   los encabezados: LinkedIn devuelve el id del post en `x-restli-id` y el
   cuerpo **vacío**. Sin leerlo, la publicación salía bien y Goossip contestaba
   que no sabía dónde había quedado — que para el usuario es igual que un fallo.

Ninguno se veía con las pruebas de la corrida 5, porque aquellas comprobaban que
la conexión estuviera viva. **Estar conectado y poder publicar no son lo mismo.**

## Decisiones que se apartan del issue, y por qué

- **Los logos y las piezas van al almacén de medios de la casa, no a Blob.** El
  issue dice Blob; el almacén que ya existía (`/api/upload-image` → relay →
  `mcp.mindcontextia.one/media`) lleva funcionando desde la corrida 1. Se
  EXTRAJO a `src/creative/media.ts` —estaba metido dentro de una ruta de Next y
  por eso el motor no lo podía usar— pero no se reescribió. Cambiar el destino
  es cambiar ese archivo y nada más.

- **La memoria `meta-marketing-playbook` no existe.** El issue la nombra. Se
  buscó en el Brain por nombre exacto, por variantes y por contenido: **0
  filas** de 3298. No se inventó nada en su lugar; lo que sí entró son las 200
  memorias de diseño, marca y campañas con importancia ≥ 6.

- **`/mnt/skills` no existe en el servidor.** El issue lo preveía ("si no, tomar
  del repo skills-vault") y eso se hizo. El script lo reporta en cada corrida en
  vez de callarlo.

- **Canva queda escrito y probado hasta donde se puede.** Los 32 slugs de tools
  salieron del catálogo real, y el baile completo —listar plantillas de marca,
  leer su dataset, autofill, exportar— está implementado. Lo que NO se puede
  fingir: el autofill de plantillas de marca es una función de Canva Enterprise
  y MOMENTUM no tiene Canva conectado. El motor cae al compositor propio **y lo
  dice con esas palabras** en la pantalla y en la respuesta del Asistente.

- **Higgsfield entra con el token de la casa, no por cliente.** Higgsfield no
  tiene cuentas por proyecto y no se va a inventar una. Se midió que la API
  responde (`fnf.higgsfield.ai/agents/*`, 117 modelos, un job real completado),
  y sin `HIGGSFIELD_ACCESS_TOKEN` en el entorno los adaptadores dicen que no
  está disponible en vez de tronar.

- **La sección "Marca" va junto a Contenido, no bajo "Proyecto".** El kit se
  toca todo el tiempo mientras se hacen piezas, no una vez al dar de alta el
  proyecto.

- **`posts` gana `project_id`.** Solo tenía `org_id`: con tres clientes en la
  misma agencia, la sección Contenido del cliente A le enseñaba lo publicado por
  el cliente B. Nullable, porque las publicaciones viejas no saben de qué
  proyecto salieron y adivinárselo sería inventar.

- **La migración se partió en 0017 y 0018.** El corredor lleva la cuenta por
  NOMBRE DE ARCHIVO, no por contenido: agregarle líneas a una migración ya
  aplicada no vuelve a correrla. Medido — `db:migrate` contestó "Migrations up
  to date" con la columna sin crear. Queda escrito: **una migración aplicada no
  se edita, se hace otra.**

- **Los scripts dejaron de depender de un `.env`.** Usaban `import
  'dotenv/config'`, que lee `.env` y no `.env.local`. El enlace que se dejó para
  taparlo se subió a Vercel apuntando a un archivo que allá no existe y el build
  murió con `ENOENT: stat '/vercel/path0/.env'`. Ahora `src/env.ts` lee
  `.env.local` y después `.env`, sin pisar lo que venga del entorno.

## Lo que falta y depende de Luis

1. **Un post de prueba quedó publicado en el LinkedIn de MOMENTUM.** Durante el
   diagnóstico del 426 salió una publicación de una línea ("Prueba de la corrida
   6 de Goossip."). No se pudo borrar: esa conexión **no tiene permiso** para
   listar ni borrar publicaciones (`403 ACCESS_DENIED` en
   `partnerApiPostsExternal.FINDER-author`). Son dos clics desde el perfil.

2. **Canva en MOMENTUM.** Conectarlo y cargarle una plantilla de marca. Sin eso,
   el motor seguirá componiendo por su cuenta — que funciona, pero la plantilla
   del cliente siempre va a quedar mejor que lo que arme un programa.

3. **`HIGGSFIELD_ACCESS_TOKEN` en Vercel.** Hoy la app no lo tiene, así que foto
   de producto, UGC y video quedan apagados en producción. Es un token de sesión
   de la cuenta de la casa: meterlo o no es llamada de Luis.

4. **Al mergear**, contra producción y en este orden: `npm run db:migrate` (crea
   `design_knowledge`, `project_brand_kit`, `creative_pieces` y
   `posts.project_id`) y después `npm run ingest:diseno` con
   `BRAIN_DATABASE_URL` puesta.

5. Siguen abiertos los bloqueos viejos: `CLERK_SECRET_KEY` y las
   `NEXT_PUBLIC_CLERK_*` fuera del entorno Preview, `CLERK_WEBHOOK_SECRET` sin
   dar de alta, WABA en Business Manager, Twilio fuera de Trial, y el "Secured
   by Clerk" (es plan de pago, medido en la corrida 3).

## Siguiente acción

Mergear, correr las dos órdenes del punto 4, y entrar a
`vliving.life/projects/<MOMENTUM>/marca` a revisar la paleta que propuso Gemini.
Con el kit aprobado, desde el Asistente (⌘K) basta con *"hazme la publicación de
esta semana para Instagram, con su pieza"* para tener tres opciones en un minuto
y publicarlas con la cuenta del cliente.
