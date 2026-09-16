# GOOSSIP CORRIDA 5 — COMPOSIO

```
GOOSSIP CORRIDA 5 — COMPOSIO
Toolkits en catálogo: 21 · con managed auth: 17 · próximamente: 4 (Meta Ads, TikTok, X, Semrush)
Usuario nuevo → conectado sin app propia: OK hasta la pantalla de permisos del proveedor, con la app de Composio y cero credenciales nuestras · conectados de verdad: [Airtable — cuenta real, escritura y lectura de vuelta]
Acción real ejecutada por Composio: leer las 3 bases de Airtable de All Global Holding, escribir una fila en la tabla "V-Momentum" y volver a leerla — con el user_id del proyecto, no con una llave nuestra
Poll de leads vía Composio: OK · dedupe probado (webhook y poll traen el mismo leadgen_id → 1 sola fila)
Aislamiento entre proyectos: OK (en la base y ante Composio, misma org y distinta org)
Deploy preview Vercel: READY · PR: #38
Bloqueos de Luis: [autorizar Google, Slack y Notion con sus cuentas — un OAuth necesita a un humano | Meta Ads, TikTok, X y Semrush no tienen auth administrada en Composio: o se quedan "Próximamente" o Luis decide meter app propia | CLERK_SECRET_KEY y las NEXT_PUBLIC_CLERK_* siguen fuera del entorno Preview | correr `npm run db:migrate` y `npm run composio:bootstrap` contra producción al mergear]
```

## Lo primero: la llave SÍ estaba

El encargo decía que `COMPOSIO_API_KEY` llegaba como `[SENSITIVE]` y que buscara en
`/root/secrets/goossip-composio.env`. Ahí no estaba, pero **sí en `/root/composio.env`**
(`ak_u…`, probada: `GET /api/v3/toolkits` → **200**). Toda esta corrida se construyó y se
midió contra la API v3 de verdad, no contra una maqueta. **No es un bloqueo.**

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Slugs del issue contra el catálogo real | `GET /api/v3/toolkits/{slug}` de los 21 | **21/21 existen** · `google_analytics` y `google_search_console` son los slugs buenos (`googleanalytics` y `searchconsole` dan 404) · `youtube_analytics` no existe |
| Cuáles tienen auth administrada | `composio_managed_auth_schemes` de cada uno | **17 sí** · **4 no**: `metaads`, `tiktok`, `twitter`, `semrush` |
| Klaviyo | mismo camino | **sin auth administrada** → entra **Mailchimp** en su lugar, que sí la tiene (lo autoriza el issue) |
| Auth configs listos | `npm run composio:bootstrap` | **17/17** · 13 adoptados de los que ya existían en la cuenta, 4 creados (instagram, canva, google_analytics, google_search_console) |
| Idempotencia del bootstrap | correrlo otra vez | **0 creados, 0 adoptados, 17 ya estaban** |
| Ningún toolkit con dos auth configs nuestros | listado paginado de los 40+ de la cuenta | **0 duplicados** |
| Connect Link | `POST /connected_accounts/link` con el auth config administrado | **201** · `https://connect.composio.dev/link/lk_…` · la cuenta nace **`INITIALIZING`**, no `ACTIVE` |
| El endpoint viejo ya no sirve | `POST /connected_accounts` con auth administrada | **400** `ConnectedAccount_BadRequest` — por eso se usa `/link` |
| El botón "Conectar", apretado en WebKit | un clic en la tarjeta de Slack, con sesión real | la app manda a **`connect.composio.dev/link/lk_…`** y la ventana acaba en la pantalla de permisos de Slack con `redirect_uri=backend.composio.dev` — **la app que pide permiso es la de Composio, no una nuestra** |
| Conexión REAL de un proyecto | Airtable con la llave de Luis, `user_id = project:<uuid>` | **`ACTIVE`** · `verify()` → `ACTIVE` |
| Acción REAL | `tools/execute` con esa cuenta | **3 bases leídas** (`Untitled Base`, `V momentum`, `V credit`) |
| Escribir y leer de vuelta | crear fila en "V-Momentum" y releer la tabla | **la fila se escribió y apareció al releer** (y se borró al terminar) |
| Importar conocimiento | `readDocs` del adaptador de Airtable | **documentos con texto y su fuente** (`airtable:appJ…/V-Momentum`) |
| Revocar | `DELETE` en Composio + fila | **borrada allá** · la fila queda `disconnected`, **sin `verified_at`** y **conservando quién la conectó** |
| Nada verde sin verificación fresca | tarjeta con `verified_at` de hace 26 h | **"Reconectar"**, nunca "Conectado" |
| Cuenta que ya no existe | `verify()` contra un `ca_` inventado | la fila cae a **`needs_reconnect`** y la tarjeta dice **"Reconectar"** con el motivo en español |
| Los motivos no traen jerga | los 5 estados de Composio traducidos | **0** palabras como `token`, `oauth` o `grant` |
| Aislamiento — base | 3 proyectos (2 de la misma org, 1 de otra) | A2 ve **0** conexiones de A1 · B1 ve **0** · pedir A1 con el org de B devuelve **vacío** |
| Aislamiento — Composio | `GET /connected_accounts?user_ids=project:<id>` | **ninguna** cuenta de A1 aparece en A2 |
| Leads — aplanado | lead de Graph con campos en español | saca nombre, teléfono (`phone_number`) y correo (`correo_electronico`) |
| Leads — dedupe | el mismo `leadgen_id` por el webhook y por el poll | **1 sola fila** · el segundo devuelve `created:false` y el mismo id |
| Leads — ventana del poll | proyecto con leads vs. proyecto nuevo | pide **desde el último lead** (menos un minuto) · el nuevo mira **7 días** atrás |
| Pruebas de la corrida 5 | `npm run test:composio` | **72 pasadas, 0 fallidas** |
| Caso que DEBE fallar | se le puso `managed: true` a TikTok a mano y se volvió a correr | **4 fallidas**, justo las del catálogo. Restaurado y verde otra vez |
| Pruebas de la corrida 4 | `npm run test:campanas` con servidor | **123 pasadas, 0 fallidas** |
| Pruebas de la corrida 3 | `npm run test:projects` con servidor | **99 pasadas, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` con servidor | **89 pasadas, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| UI | WebKit 1440×900 y 390×844, con sesión real de Clerk | **8 capturas**, **8 con HTTP 200**, **0 errores de JS**, **0 notas internas** |
| La pantalla, leída | `document.body.innerText` de Conexiones | **3 grupos** · **24 tarjetas** · Conectado 1, Reconectar 1, Próximamente 4, el resto sin conectar |
| Build | `npm run build` | `✓ Compiled successfully in 6.3s` |
| **Deploy preview** | `vercel deploy` | **READY** — https://goossip-84ypj66fl-luis-projects-48b011f9.vercel.app |

Las capturas viven en `/root/repos/goossip-composio-c5/capturas-c5/` del servidor (8 MB de
PNG no entran al repo). Lo que sí se versiona es `capturas-c5/resumen.json`, que es la
medición.

## Qué quedó construido

**1. El catálogo es uno solo y está medido** (`src/projects/catalog.ts`). Los 21 toolkits del
issue más los tres propios de Goossip (el formulario del sitio, el catálogo y WhatsApp), en
los tres grupos que pide el issue. El campo `managed` no sale de la memoria: sale de
`composio_managed_auth_schemes`, y hay una prueba que lo vuelve a comprobar contra Composio
cada vez que corre. El día que Composio habilite TikTok, la prueba falla y la tarjeta se
enciende cambiando una línea.

**2. Un `auth config` administrado por toolkit, sin ensuciar la cuenta.**
`npm run composio:bootstrap` lista lo que hay, **adopta** lo que ya existía (la cuenta traía
40 auth configs de antes) y solo crea lo que falta. El `ac_xxx` se guarda en
`composio_auth_configs` con el logo y el nombre reales del toolkit. Correrlo dos veces crea
cero.

**3. El `user_id` de Composio es el PROYECTO.** `project:<uuid>`, documentado en el código y
probado: el equipo del proyecto comparte las cuentas y un cliente no arrastra las de otro.
Si fuera el usuario de Clerk, el Facebook del cliente se iría el día que cambien de community
manager.

**4. El baile completo, con la verdad del lado de Composio.** Conectar pide el Connect Link y
deja la fila en `connecting` con el `connected_account_id` **antes** de mandar al usuario —así
la vuelta no depende de qué parámetros quiera ponerle Composio a la URL de regreso. Volver
consulta esa cuenta: **solo `ACTIVE` la deja conectada**, con `verified_at` en ese instante.
Revocar borra la cuenta **también en Composio**.

**5. Verde es una promesa y hay que merecerla** (regla del issue #33). `social_accounts`
gana `verified_at` (migración `0016`). Una conexión con verificación de más de 24 h **no se
pinta de verde**: dice "Reconectar". Se verifica al abrir la pantalla y todos los días a las
5:00 UTC (`/api/cron/conexiones`), que es lo que mantiene fresca la verificación de los
proyectos que nadie abre.

**6. Cuatro estados y ni uno más**: Conectado · Sin conectar · **Reconectar** · Próximamente.
El nuevo no es cosmético: una cuenta que el cliente revocó desde Facebook pide una acción
hoy, y pintarla igual que una que nunca se conectó esconde el problema.

**7. La pantalla de Conexiones**, en tres grupos, con el logo real de cada toolkit
(`toolkit.meta.logo` de Composio, no PNG nuestros que envejecen solos), una línea de qué
habilita en Goossip, quién lo conectó y cuándo, y el aviso una sola vez arriba: *"Al conectar
verás una pantalla de permisos de Composio, nuestro proveedor de conexiones seguras."*
Instagram lleva su nota de cuenta Business o Creator. Cero referencias a la app de Meta propia.

**8. `src/channels/`: un adaptador por toolkit, con acciones reales.** Publicar (Facebook,
Instagram, LinkedIn, X, TikTok, YouTube), leer campañas y gasto (Meta Ads, Google Ads), leer
filas (Sheets, Airtable), leer documentos (Notion, Drive), contactos en los dos sentidos
(HubSpot), agendar (Calendar), escribir (Gmail) y avisar (Slack). **Todos los slugs de tools
y sus argumentos salen del catálogo real**, no de memoria.

**9. Los leads de Meta ya no dependen de nuestra app.** Cada 5 minutos
(`/api/cron/leads`) se les preguntan los leads a los formularios del proyecto con la cuenta
que el cliente autorizó. Si el proyecto no eligió formularios, se descubren solos desde sus
páginas — que es lo que hace que un proyecto **recién creado** reciba leads sin que nadie
mueva nada en el panel de Facebook. El webhook sigue vivo: los dos escriben con el mismo
`leadgen_id` y por eso traer el mismo lead dos veces no lo duplica.

**10. Importar el conocimiento que el cliente ya escribió.** Botón en Conocimiento para traer
de Notion, Drive, Sheets y Airtable a `knowledge` **con embeddings**, reusando el pipeline que
ya existía. Idempotente por fuente: importar dos veces actualiza, no duplica.

**11. La app de Meta propia se apagó, no se borró.** Todo el OAuth de la corrida 3 sigue en el
código detrás de `META_OWN_APP`, que por omisión está **apagado**. Con la bandera apagada
nada llama a Graph API con credenciales nuestras: publicar pasa por los adaptadores del
proyecto.

**12. El enlace de un solo uso ahora sirve para los 17.** "Pídele a alguien que conecte tu
Facebook" funciona para cualquier conector de Composio, no solo para Meta. El token del
enlace viaja dentro del `callback_url` y se quema al volver, con el permiso ya dado.

## Decisiones que se apartan del issue, y por qué

- **Klaviyo no entra; entra Mailchimp.** Medido: Klaviyo no tiene auth administrada. El issue
  ya lo preveía.

- **Meta Ads sale "Próximamente"** aunque el issue lo pide conectable. Medido: `metaads` pide
  `client_id` y `client_secret` de una app propia, o que el cliente pegue un token de sistema.
  Las dos cosas son exactamente lo que esta corrida quita de en medio, así que no se inventa
  una tercera. El adaptador está escrito y probado del lado que se puede: el día que Composio
  habilite la auth administrada, la tarjeta se enciende sola.

- **WhatsApp, el formulario del sitio y el catálogo se quedan en la pantalla.** El issue habla
  de los tres grupos de Composio y deja WhatsApp fuera de la corrida. No se tocaron: se
  colocaron dentro de los mismos tres grupos (el sitio y el catálogo son fuentes de verdad;
  WhatsApp es operación). Quitarlos habría borrado la única forma que tiene el cliente de
  generar la dirección de su formulario, que sí funciona hoy.

- **La conexión real de punta a punta se probó con Airtable, no con Google Sheets, Notion o
  Slack.** Autorizar un OAuth necesita a un humano con esas cuentas; una prueba que depende de
  un humano no es una prueba. Airtable admite conexión por llave y Luis ya tenía la suya en el
  entorno, así que con ella se probó **lo que importa**: cuenta `ACTIVE` colgada del proyecto,
  `verify()`, acción real de lectura, escritura real y lectura de vuelta, y revocación. El
  auth config de esa prueba es un apaño de la prueba y se borra al terminar; el producto usa el
  administrado. Para los otros tres, lo que sí quedó probado con el navegador es el camino
  completo hasta la pantalla de permisos del proveedor.

- **El `user_id` de Composio lleva el prefijo `project:`.** El issue dice "el `user_id` es el
  `project_id`" y así es, uno a uno; el prefijo solo existe para que un id suelto en un log de
  Composio se lea solo.

- **La migración se llama `0016` y no `0015`.** Nació como 0015 y al rebasar sobre `main` la
  corrida 4 ya se había quedado con ese número. Se renumeró y se dejó escrito que se puede
  volver a correr sin miedo (todo es `IF NOT EXISTS`).

- **"Composio" dejó de ser jerga prohibida.** La corrida 3 lo tenía en la lista negra de
  palabras que el cliente no debe leer; el issue de esta corrida dicta la frase que sí la
  contiene. La prueba cambió en consecuencia: ya no prohíbe la palabra, **exige** que aparezca
  una sola vez y con su frase completa.

- **El entorno Preview estrena su propia base.** Para que el deploy preview pudiera quedar
  READY hacía falta `DATABASE_URL`, que era un pendiente desde la corrida 1. En vez de
  apuntarlo a producción se creó una **rama `preview` en Neon** (copia de `main` al momento) y
  esa es la que usan los previews: probar en un preview ya no puede escribir en los datos de
  los clientes. Se probó antes de inyectarla (contestó, con los 3 proyectos copiados).

## Lo que falta y depende de Luis

1. **Autorizar las cuentas.** Nadie puede dar el permiso de Google, Slack o Notion más que
   quien es dueño de esas cuentas. El camino está probado hasta la pantalla de permisos: Luis
   entra a Conexiones, aprieta "Conectar" en Google Sheets, Slack y Notion, y con eso quedan
   los tres "conectados de verdad" que pedía el issue.

2. **Meta Ads, TikTok, X y Semrush.** Hoy salen "Próximamente" porque Composio no administra su
   auth. Si Luis quiere encenderlos, es decisión suya y significa registrar app propia (Meta,
   TikTok, X) o pedirle su API key al cliente (Semrush). El código ya los tiene escritos.

3. **Clerk en el entorno Preview.** `CLERK_SECRET_KEY` y las `NEXT_PUBLIC_CLERK_*` no están en
   Preview, así que el preview compila y responde pero no monta la sesión. No lo inyecté: son
   las llaves de producción de Clerk y meterlas en un entorno con URL pública distinta es
   llamada de Luis.

4. **Al mergear**, correr contra producción `npm run db:migrate` (crea
   `composio_auth_configs` y `social_accounts.verified_at`) y después
   `npm run composio:bootstrap` (deja los 17 auth configs listos). En ese orden.

5. Siguen abiertos los bloqueos viejos: `CLERK_WEBHOOK_SECRET` sin dar de alta, WABA en
   Business Manager, Twilio fuera de Trial, y quitar el "Secured by Clerk" (es plan de pago,
   medido en la corrida 3).

## Siguiente acción

Mergear, correr las dos órdenes del punto 4 contra producción, y entrar a
`vliving.life/projects/<proyecto>/conexiones` a apretar "Conectar" en Google Sheets, Slack y
Notion. Son tres clics y con eso el proyecto queda leyendo precios de una hoja, avisando al
equipo por Slack y trayendo el manual de Notion — sin que Goossip registre una sola app de
developer.
