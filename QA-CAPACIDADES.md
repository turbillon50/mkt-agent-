# QA de capacidades — Goossip en producción

**Proyecto medido:** MOMENTUM · `5cf4d33c-3c3d-417a-a10d-212504d62773` · org `all-global`
**Producción:** https://vliving.life · commit `1926f97`
**Fecha:** 16-sep-2026, 12:26–12:42 UTC · **Node** v20.20.2
**Cuadrilla:** QA de Goossip (worktree de solo lectura `/root/repos/goossip-qa-20260916`, sin commits ni PR)

## Cómo se midió

No se simuló nada. Se armó una **sesión real de Clerk** para `turbillon50@gmail.com`
(sign-in token por la Backend API → ticket contra la Frontend API `clerk.vliving.life`
→ cookies `__session` + `__client_uat`) y con ella se pegó a las rutas de producción.
El JWT trae `o.slg = all-global`, `o.rol = admin`, así que la puerta de organización y
la de proyecto se pasaron como las pasa Luis, no por atrás.

Donde la app no expone la capacidad, se midió el **piso de abajo** —Composio con
`COMPOSIO_API_KEY` y `user_id = project:5cf4d33c-…`— para poder decir si lo que falta
es el permiso del proveedor o el cable dentro de Goossip. Son dos respuestas muy
distintas y la tabla las distingue.

La base es la de producción (Neon `ep-plain-cloud-at5b4jvb`). Las capturas son WebKit
1440 px, y **se miraron**, no solo se tomaron: de ahí sale el hallazgo #9.

---

## La tabla

| # | Capacidad | Veredicto | Cómo se probó | Resultado medido | Evidencia | Causa raíz si falla |
|---|---|---|---|---|---|---|
| 1 | Publicar texto en **Facebook** | ❌ **No puede** | `POST /api/posts/publish-now` `{platform:"facebook"}` con sesión | **HTTP 400**. Abajo: `403 Forbidden` en `graph.facebook.com/v20.0/1173019489236259/feed`, `(#200) OAuthException`, fbtrace `ArM-LdO2Ni1RMvo1evBnOHl` | respuesta HTTP + `log_qhlmz0PRwZGW` de Composio | Composio firma `FACEBOOK_CREATE_POST` con el **token de USUARIO**, y `/{page}/feed` exige **token de PÁGINA**. No son los permisos: `/me/permissions` devuelve `pages_manage_posts=granted` y `pages_read_engagement=granted`. Mismo síntoma en la fila 4 |
| 2 | Publicar **foto en Instagram** | ⚠️ **Mitad probada, mitad fuera de alcance** | `INSTAGRAM_CREATE_MEDIA_CONTAINER` con una pieza generada en la fila 9 | **Paso 1 de 2 OK** → contenedor `18088714910389460`, `successful:true` | `log_-jZ48bi-4jsO` | El paso 2 (`INSTAGRAM_CREATE_POST`) **no se corrió**: la cuenta de IG que MOMENTUM tiene conectada es **@v_living_co**, o sea V&LIVING, y la misión prohíbe tocar V&LIVING. Ver hallazgo B |
| 3 | Publicar en **LinkedIn** | ✅ **Sí puede** | `POST /api/posts/publish-now` `{platform:"linkedin"}` | **HTTP 200** en 2.1 s → `urn:li:share:7505966171595218944`, `externalUrl` devuelta, fila en `posts` | respuesta HTTP + fila `84c82d16-…` | — (pero ver hallazgo C: publica **solo texto**) |
| 4 | Leer **comentarios y conversaciones de Messenger** | ❌ **No puede** | Búsqueda exhaustiva de ruta/adaptador/herramienta + prueba directa en Composio | **No existe superficie**: ninguna ruta en `app/api`, ningún método en `src/channels`, ninguna de las 13 herramientas del Asistente. La pantalla *Conversaciones* solo lee `whatsapp / sms / email`. Y a mano: `FACEBOOK_GET_PAGE_CONVERSATIONS` → `(#190) This method must be called with a Page Access Token` | `log_STin2j617wCa` | **Dos capas rotas a la vez**: (a) nadie cableó Messenger en Goossip; (b) aunque se cableara, el toolkit de Facebook en Composio no usa el token de página |
| 5 | Listar **DMs de Instagram** | ⚠️ **Composio sí, Goossip no** | `INSTAGRAM_LIST_ALL_CONVERSATIONS` con la cuenta del proyecto | **8 conversaciones reales**, la más nueva `2026-09-15T04:35:04Z` | `log` de Composio, ids `aWdfZAG06MzQw…` | Falta el cable: no hay adaptador, ni ruta, ni herramienta del Asistente que lea DMs |
| 6 | Enviar **correo por Gmail** | ⚠️ **Sí por abajo, no por la app** | `GMAIL_SEND_EMAIL` + `GET /api/integrations/email` con sesión | Composio: **enviado**, id `1a0aa34f567ccf84`, desde `luisdelator@vmomentums.info`. App: `{"configured":false,"connected":null}` aunque Gmail sale **Conectado** en Conexiones | `log_xHDXYfw9H8BK` + respuesta HTTP | `app/api/integrations/email/route.ts` es de antes del modelo por proyecto: busca la cuenta de Composio con el **Clerk userId** en vez de `project:<id>`, y `configuredEmailToolkits()` depende de variables de entorno que no están puestas |
| 7 | Listar **videos de YouTube** | ⚠️ **Composio sí, Goossip no** | `YOUTUBE_LIST_CHANNEL_VIDEOS` sobre el canal del proyecto | **5 videos** del canal `UCin6Vx20-2lscsPGEc0wgyw` ("All Global Holding"): `Uz-MTT4tfRk`, `aDMMqbXAiGU`, `ERg3n2Px9lg`, `SOyJI-z5gQ4`, `4jsgxCXXeAg` | `log_Gpext6zgknbE` | El adaptador `youtube.readCampaigns` existe pero **nadie lo llama**: no hay ruta ni herramienta. Y pide un `channelId` que Goossip **no guarda en ningún lado** — hubo que sacarlo con una llamada cruda a `/youtube/v3/channels?mine=true` |
| 8 | Leer **campañas de Google Ads** | ⚠️ **La vía del adaptador sí, la app no** | La consulta exacta de `src/channels/pauta.ts` por el proxy de Composio + `GET /api/ads/campaigns` | Adaptador: **HTTP 200**, cliente `3715754231` → `Campaign #1`, `PAUSED`, 0 gasto / 0 impresiones. App: `{"connected":false,"campaigns":[]}` y la pantalla *Campañas* pide **teclear el Customer ID a mano** | respuesta del proxy + captura `capturas-qa/shot-campanas.png` | Misma causa que la fila 6: `app/api/ads/campaigns/route.ts` llavea por Clerk userId. Además los ids de cliente **son descubribles** (`customers:listAccessibleCustomers` → `3715754231`, `7745650752`) y nadie los pide |
| 9 | Generar **3 piezas con el kit de marca** | ❌ **Genera, pero no sirven** | `POST /api/projects/<id>/piezas` `{red:"instagram", opciones:3}` | **HTTP 200 en 11.7 s**, 3 JPG reales de **1080 × 1350** (70 KB / 119 KB / 60 KB, descargados y abiertos). **Todo el texto sale en cajas vacías** (`.notdef`): titular y CTA ilegibles en las 3 | `capturas-qa/pieza-instagram-tofu.jpg`, `capturas-qa/pieza-linkedin-tofu.png`, y la galería completa en `capturas-qa/shot-contenido.png` — **las 18 piezas del proyecto están así** | `src/creative/compose.ts:171,184` dibuja titular y CTA como `<text font-family="Montserrat, Helvetica, Arial, sans-serif">` en un SVG que compone `sharp`. En el runtime de Vercel **no hay ninguna fuente instalada**, así que librsvg no encuentra ni Montserrat ni el respaldo y pinta la caja del glifo faltante |
| 10 | **Medidas de red** desde la memoria de diseño | ✅ **Sí puede** | Pregunta al Asistente por las medidas de IG + por lo que dice la memoria de diseño sobre contraste | Historia **1440 × 2560**, zona segura **358 / 896 / 86 px** — coincide exacto con `specs.ts` (`0.14 / 0.35 / 0.06` de 2560 y 1440), **con la fuente citada**. Y del contraste: 4.5:1 WCAG AA con los hex reales (`--txt #f0f4ff`, `--void #03020a`) sacados de `design_knowledge` (1 748 trozos) | respuesta del Asistente + `src/creative/specs.ts:155-215` | — |
| 11 | **Lead por webhook del sitio** → aparece en Leads | ✅ **Sí puede** | `POST /api/webhooks/site/nPa5NHwc…` con JSON | **HTTP 200 en 71 ms** → `{"ok":true,"creado":true,"grado":"A"}`. `GET /api/sales/leads` lo devuelve con score **80/A** y el desglose (lada 55 → Ciudad de México, "Acaba de entrar") | respuesta HTTP + lead `937d2416-…` | — (nota: `phoneValidation: "no_se_pudo (sin credenciales)"` — el Lookup de Twilio no está configurado) |
| 12 | El **vendedor propone** respuesta a un lead | ✅ **Sí puede** | `POST /api/sales/seller` con el lead de la fila 11 y un mensaje de compra | **HTTP 200 en 853 ms**: modo `propone`, intención `precio`, `escala:true` ("señal de compra o pide hablar con alguien"), etapa sugerida `interesado`, `del_modelo:true`, y la respuesta redactada | respuesta HTTP completa | — |
| 13 | La **cola ejecuta una regla** | ⚠️ **Encola y ejecuta; la entrega falla** | Se dejó que la regla corriera sola con el lead de la fila 11 | `rule:nuevo_lead_grado_a` encoló la acción `4702daf1-…` **en el mismo milisegundo** que nació el lead (`notify_owner`, `status:auto`). El cron de cada minuto la ejecutó y quedó **`failed`** → `{"error":"el proyecto no tiene owner_phone en sus reglas"}`. Las 3 acciones previas del proyecto murieron igual | `GET /api/queue` | `notify_owner` solo sabe entregar por WhatsApp/SMS a `campaigns.rules.owner_phone`. MOMENTUM no tiene ese campo y **no hay respaldo por correo** — teniendo Gmail conectado y funcionando (fila 6) |
| 14 | El Asistente **encadena** "hazme la pieza y publícala en LinkedIn" | ⚠️ **Sí encadena, pero en 3 turnos y miente al final** | `POST /api/projects/<id>/asistente`, tres turnos | Turno 1 (8.8 s): escribió el copy y **pidió permiso** pese al "hazlo ya, sin preguntarme nada más". Turno 2 (16.7 s): 3 piezas 1200×1200 y "¿cuál te late?". Turno 3 (6.3 s): **publicó de verdad** → `urn:li:share:7505967549709213696`, fila `9ec7abe3` en `posts`… **y contestó que había fallado por contenido duplicado** | respuestas del Asistente + fila en `posts` | (a) La descripción de `generar-texto-de-post` le ordena ofrecer la imagen **antes de publicar nada**, así que nunca puede ser un solo turno. (b) El modelo narró un fallo que el campo `publicado` desmiente: **quien lea esa respuesta vuelve a publicar y sale doble** |
| 15 | **Conexiones**: estado fiel vs Composio | ✅ **Fiel** | `GET /api/projects/<id>/connections` contra `GET /connected_accounts` de Composio, en la misma ventana | Goossip: **7 conectados** (facebook, instagram, googleads, gmail, linkedin, youtube + sitio) y TikTok/X en `reconectar`. Composio: **6 ACTIVE** + tiktok `INITIATED` + twitter `INITIALIZING`. **Cuadra uno a uno.** El GET además **re-verifica en vivo** (`verifiedAt` pasó de 12:26 a 12:28) | `capturas-qa/shot-conexiones.png` + ambos JSON | — (dos detalles menores en el hallazgo D) |
| 16 | **Invitación de equipo** y **enlace de conexión** (crear) | ⚠️ **Se crean bien; revocar no revoca** | `POST /members` y `POST /links` con sesión, + captura de la pantalla del enlace | Invitación: **200**, miembro `722468ed-…`, `status:invitado`. Enlace: **200**, `https://vliving.life/conectar/aKWUc5jB…`, expira en 72 h. La pantalla del enlace se ve limpia: "Conecta Facebook a MOMENTUM" y un botón | `capturas-qa/shot-conectar.png` | **`DELETE /members/<id>` devolvió `ok:true` y la invitación de Clerk se quedó `pending`** — hubo que revocarla a mano por la API de Clerk. El handler borra la fila local y nunca toca el `invitationId` que el POST sí guardó |

**Resumen de las 16:** **5 sí** (3, 10, 11, 12, 15) · **8 a medias** (2, 5, 6, 7, 8, 13, 14, 16) ·
**3 no** (1, 4, 9).

---

## Los hallazgos que cuestan dinero

### A. Las piezas salen sin letras (fila 9) — el más caro
No es un detalle estético: **ninguna pieza de Goossip es publicable hoy**. Las 18 del
proyecto tienen el titular y el botón en cajas vacías. Se ve en `shot-contenido.png`.
La causa es de una línea: el compositor pide `Montserrat, Helvetica, Arial, sans-serif`
a un runtime que no tiene **ninguna** fuente instalada. Se arregla embarcando un `.ttf`
con el bundle y registrándolo en fontconfig (o componiendo el texto con `sharp` a partir
de un SVG con la fuente incrustada en base64), no tocando el diseño.

### B. MOMENTUM no tiene cuentas propias de Meta
El Facebook que MOMENTUM tiene conectado administra **una sola página: "V&living"**
(`1173019489236259`). El Instagram es **@v_living_co**. Es decir: si Facebook llegara a
publicar, publicaría en la página de V&LIVING desde el proyecto MOMENTUM. Por eso la
fila 2 se quedó en el paso 1 y la 1 no se reintentó por otra vía — la misión prohíbe
tocar V&LIVING. **Antes de vender MOMENTUM hay que darle sus propias cuentas.**

### C. LinkedIn publica solo texto, pero la pieza queda marcada como publicada
`src/channels/publicacion.ts:223` arma el cuerpo con `commentary` y nada más:
**`input.media` se ignora**. Aun así `publish-now` guarda `piezaId` en el post y llama
`marcarPublicada`. Resultado: el usuario ve la pieza en "Publicada" y en LinkedIn solo
hay texto. Es el mismo tipo de mentira que la fila 14.

### D. La pantalla *Campañas* pide conectar lo que ya está conectado
`app/(dashboard)/projects/[id]/campanas/page.tsx:37` busca `cards.find(c => c.id === 'meta')`,
pero la tarjeta se llama **`facebook`** (medido en el JSON de `/connections`). Como nunca
encuentra nada, `meta?.state !== 'conectado'` siempre es verdad → el letrero "Conecta
Facebook…" es **permanente**, y `disponibles` (los formularios de lead ads) siempre viene
vacío, así que **una campaña nunca se puede amarrar a un formulario de Meta**. Se ve en
`shot-campanas.png` con Facebook conectado a un lado.

Dos detalles menores de la fila 15: la tarjeta de X/TikTok dice en pantalla *"El permiso
venció"* mientras el API fresco dice *"Te quedaste a medias en la pantalla de permisos"*
(la página pinta el `motivo` viejo guardado en la base); y la fila de `twitter` todavía
apunta a `ca_VtoO9hoJPxIC` cuando la cuenta viva en Composio es `ca_wn_Qu-r40_Jd`.

### E. Revocar a un invitado no lo saca de la organización
`DELETE /api/projects/<id>/members/<memberId>` borra la fila de `project_members` y
contesta `ok:true`, pero **no revoca la invitación de Clerk**. Medido: después del
DELETE, `GET /organizations/<org>/invitations?status=pending` seguía devolviendo 1.
Quien tenga ese correo podía seguir entrando a `all-global`. El `invitationId` se guarda
en el POST y el DELETE ni lo mira.

### F. El enlace de conexión no deja pasar a quien es para
La pantalla `app/conectar/[token]/page.tsx` está escrita para alguien **de fuera** —
trae su propio `SignInButton` para el caso sin sesión. Pero `proxy.ts` mete `/conectar(.*)`
en las rutas "sin org **pero con sesión**", así que un visitante anónimo se va a `/sign-in`
genérico y nunca ve esa pantalla (medido en WebKit: `302 → /sign-in?redirect_url=…/conectar/…`).
El community manager del cliente se topa con un formulario de registro de Goossip en vez
de con "Conecta Facebook a MOMENTUM".

### G. Dos rutas viejas llavean por el usuario, no por el proyecto
`app/api/ads/campaigns/route.ts` y `app/api/integrations/email/route.ts` buscan la cuenta
de Composio con el **Clerk userId**. Desde la corrida que movió todo a `project:<id>`,
esas dos rutas **no pueden encontrar nada nunca** y contestan "no conectado" con la cara
seria. Es lo que ve el usuario en *Campañas*.

---

## Lo que se borró

| Qué | Cómo se borró | Verificación |
|---|---|---|
| Post de LinkedIn `urn:li:share:7505966171595218944` | `DELETE /rest/posts/…` por el proxy de Composio | **204**; un segundo DELETE contesta **404 NOT_FOUND** |
| Post de LinkedIn `urn:li:share:7505967549709213696` (el del Asistente) | idem | **204** |
| Correo de prueba `1a0aa34f567ccf84` | `GMAIL_MOVE_TO_TRASH` | `labelIds` quedó en `["UNREAD","TRASH","SENT"]` |
| Lead de prueba `937d2416-…` + su acción de cola, sus eventos | `DELETE` en la base de producción | `select count(*)` → 0 |
| Las 2 filas de `posts` de las publicaciones de prueba | `DELETE` en la base | `where text like '%[prueba Goossip%'` → 0 |
| Las 6 piezas generadas (3 IG + 3 LinkedIn) | `PATCH /piezas/<id>` `{accion:"descartar"}` — es la única baja que expone la app | `estado = descartada` en las 6 |
| Los 8 mensajes del hilo del Asistente | `DELETE` en `chat_messages` | `DELETE 8` |
| Enlace de conexión `906bc956-…` | `DELETE /api/projects/<id>/links/<id>` | `ok:true` |
| Invitación `turbillon50+qa-goossip@gmail.com` | `DELETE /members/<id>` **+ revoke a mano por la API de Clerk** (ver hallazgo E) | invitaciones pendientes de la org: **0** |
| La sesión de Clerk que se armó para medir (`sess_3JPTJMPo…`) | `POST /v1/sessions/<id>/revoke` | `status: revoked`; pedir un token nuevo devuelve vacío |

El worktree quedó **sin tocar el código**: `git status` solo muestra `QA-CAPACIDADES.md` y
`capturas-qa/` como archivos nuevos, y `git diff` está vacío. Sin commits, sin PR.

## Lo que NO se pudo borrar

| Qué | Por qué |
|---|---|
| Contenedor de Instagram `18088714910389460` | Meta **no admite borrar** contenedores sin publicar: `DELETE` contesta `IGApiException 100/33 "does not support this operation"`. **Nunca se publicó** y Meta lo caduca solo a las 24 h. No es visible para nadie |
| Entradas de `webhook_log` y `project_events` de esta corrida | Son bitácora de auditoría. Borrar rastros de auditoría es peor que dejarlos: quedan con su marca de tiempo del 16-sep 12:33–12:36 |

## Lo que NO se probó, y por qué

| Qué | Por qué |
|---|---|
| Publicar de verdad en Instagram (paso 2 de la fila 2) | La cuenta conectada es **@v_living_co (V&LIVING)** y la misión lo prohíbe expresamente. Se midió hasta donde se pudo sin publicar |
| Reintentar Facebook por el token de página | Habría publicado en la página **V&living**. Mismo motivo |
| Subir video a YouTube, WhatsApp, cualquier cosa que cueste dinero | Fuera de alcance por instrucción |
