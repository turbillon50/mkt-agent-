# GOOSSIP CORRIDA 4

```
GOOSSIP CORRIDA 4
Sidebar: OK · ancho ajustable probado · plegado probado · un solo scroll verificado
Campañas por proyecto: OK · tabla marketing_campaigns · atribución de leads
Pantallas tocadas: 12 · capturas escritorio 1440x900 y 1280x720: 46 (+2 de celular)
Pruebas: 371, 0 fallidas · Build: OK · PR: #37
Bloqueos de Luis: [dar de alta la URL de retorno de Goossip en Facebook Login | CLERK_WEBHOOK_SECRET + alta del webhook en Clerk | COMPOSIO_API_KEY y DATABASE_URL faltan en el entorno Preview | quitar "Secured by Clerk" necesita plan de pago (vuelto a medir el 16-sep: la API contesta 204 y NO lo aplica; el sello se ve en producción) | los widgets de Clerk solo montan en vliving.life | WABA en Business Manager | Twilio fuera de Trial]
```

## Números medidos

### A · El menú lateral

Todo esto se mide DENTRO del navegador (WebKit), no se deduce del CSS. Está en
`scripts/capturas-c4.ts` y el detalle crudo en `capturas-c4/resumen.json`.

| Qué | Cómo se midió | 1440×900 | 1280×720 |
|---|---|---|---|
| El menú mide el alto de la ventana | `aside.getBoundingClientRect().height` vs `window.innerHeight` | **900 de 900** | **720 de 720** |
| Cajas con scroll DENTRO del menú | recorrer todos los hijos y quedarse con los que `overflowY` permite Y `scrollHeight - clientHeight > 2` | **0** | **1**, y es el `<nav>` |
| La zona de navegación | `scrollHeight` / `clientHeight` | 687 px en 687 px · **sin scroll** | 656 px en 507 px · **scrollea 149 px** |
| El scroll de verdad se mueve | `nav.scrollTop = 99999` y leer cuánto quedó | — | **149 px** |
| Renglones del menú | `nav a` | **15** | **15** |
| Arrastre al tope derecho | empujar el ratón a x=500 | **320 px** | **320 px** |
| Arrastre al tope izquierdo | empujar el ratón a x=80 | **200 px** | **200 px** |
| El ancho se guarda | `localStorage['goossip.sidebar.width']` tras soltar en 288 | **288** | **288** |
| …y sobrevive a la recarga | `location.reload()` y volver a medir | **288 px** | **288 px** |
| Plegado | clic en "Plegar el menú" | **64 px** | **64 px** |
| Plegado = solo íconos | etiquetas con caja visible dentro de `nav a` | **0 de 15** | **0 de 15** |
| El plegado se guarda | `localStorage['goossip.sidebar.collapsed']` | **1** | **1** |
| …y sobrevive a la recarga | recargar y volver a medir | **64 px** | **64 px** |
| Reabrir devuelve el ancho guardado | clic en "Abrir el menú" | **288 px** | **288 px** |
| Badges con números reales | leer los `.sidebar-badge` pintados | **4** (los 4 leads sin contactar del escenario) | **4** |

**El celular NO se tocó**, y también se midió: la barra de abajo sigue visible con
sus **5 botones**, el cajón cerrado sigue **fuera de la pantalla**, y abierto
enseña **15 de 15 etiquetas** con **1 sola caja con scroll**.

### B · Campañas por proyecto

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Migración `0015_campanas_por_proyecto.sql` | `npm run db:migrate` | `-> applying 0015_campanas_por_proyecto.sql` · `Migrations up to date.` |
| Tabla nueva | `information_schema.columns` | `marketing_campaigns` con **14 columnas**, las 10 del issue + `created_by`/`created_at`/`updated_at`/`id` |
| Columna de atribución | `information_schema.columns` | `sales_leads.marketing_campaign_id` · uuid · `is_nullable = YES` |
| Borrar la campaña NO borra sus leads | `referential_constraints.delete_rule` | `sales_leads_marketing_campaign_id_fkey` → **SET NULL** |
| Borrar el proyecto SÍ borra sus campañas | igual | `marketing_campaigns_project_id_fkey` → **CASCADE** |
| Índices | `pg_indexes` | **6**: proyecto+fecha, org, proyecto+estado, único `(project_id, lower(name))`, la pk y el parcial del lead |
| Idempotencia de la migración | borrar la fila de `__migrations` y volver a correrla | segunda corrida **sin error**, mismas 0 campañas |
| Presupuesto | insertar 15000 y leer de la base | `numeric(12,2)` → **`"15000.00"`**, y sale a la pantalla como **`$15,000`** |
| Canales repetidos e inventados | crear con `['meta','meta','inventado']` | queda **1**: `meta` |
| Formularios repetidos y llaves ajenas | `metaRefs: { form_ids: [x, x], basura: 'x' }` | **1 formulario**, `basura` **no existe** en la fila |
| Nombre repetido en el MISMO proyecto | crear "Preventa Tulum" y luego "preventa tulum" | **400** · *"Ya tienes una campaña con ese nombre en este proyecto."* |
| El mismo nombre en OTRO proyecto | crear "Preventa Tulum" en el proyecto B | **sí se puede** |
| Presupuesto negativo / fechas al revés / nombre de una letra | tres altas a mano | **rebotan las tres**, en español |
| Atribución por formulario | `campaignForForm` con el formulario de la campaña | devuelve **la campaña** |
| …y con un formulario ajeno | mismo, con `999999` | **null** — el lead se queda sin campaña, no colgado de una inventada |
| …y desde otro proyecto | mismo formulario, proyecto B | **null** |
| Leads de Meta | 3 con campaña + 1 del sitio | los 3 traen `marketing_campaign_id`; el del sitio **null** |
| Conteo de la campaña | `count(*)` de la campaña | **3 leads, 3 sin contactar** |
| Amarrar y soltar un lead a mano | `attributeLead` ida y vuelta | 3 → 4 → 3, y a una campaña de otro proyecto **rebota** |
| **Borrar la campaña no se lleva a la gente** | contar leads antes y después del `DELETE` | **mismo número**, y todos quedaron con campaña **null** |
| Alta de campaña por la UI | WebKit 1440, formulario llenado a mano, y después `select` contra la base | creada: objetivo `mensajes`, estado `borrador`, presupuesto `9500.00` |

**Roles, por HTTP, con sesiones reales de Clerk:**

| Quién | Ver campañas | Crear | Pausar | Borrar |
|---|---|---|---|---|
| dueño | 200 | 200 | 200 | **200** |
| editor | 200 | 200 | 200 | **403** (`problem: project_role`) — y la campaña **sigue viva** |
| conector | **403** | **403** | — | — |

Y una campaña **no se cruza de proyecto**: pedirla o pausarla desde el proyecto B
da **404** las dos veces.

### C · Inglés de Clerk y "Secured by Clerk"

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Inglés / maquinaria en NUESTRO texto | barrido estático del texto visible de **78 pantallas** contra 27 palabras | **0** — quedaban 8 antes de esta corrida (ver abajo) |
| Inglés en el texto RENDERIZADO | `document.body.innerText` de 12 pantallas × 2 tamaños | **0 en 24 capturas** |
| Clerk habla español | producción, `https://vliving.life/sign-in`, WebKit, widget montado (45 nodos) | *"Iniciar sesión"*, *"Correo electrónico o nombre de usuario"*, *"Continuar"*, *"¿No tiene cuenta? Registrarse"* — **0 palabras en inglés** |
| **"Secured by Clerk"** | el mismo render de producción | **SÍ se ve**, abajo del formulario |
| ¿Se puede quitar? | `PATCH /v1/instance` con `branded`, `clerk_branding` y `show_clerk_branding` | **204 las tres veces**, y `display_config.branded` **sigue en `true`**. Vuelto a medir el 16-sep, no copiado de la corrida 3 |

### Lo demás

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Pruebas de la corrida 4 | `npm run test:campanas` con `GOOSSIP_TEST_BASE_URL` | **123 pasadas, 0 fallidas** |
| Pruebas de la corrida 3 | `npm run test:projects` | **97, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` | **89, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62, 0 fallidas** |
| **Total** | | **371 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 5.7s` |
| UI | WebKit 1440×900 y 1280×720, 12 pantallas | **24 capturas**, **24 con HTTP 200**, **0 errores de JS**, **0 en inglés** |
| Capturas del menú | 8 estados × 2 tamaños + 2 de celular | **18 más** |

Estado de la base al cerrar: 2 organizaciones, 2 usuarios, 2 proyectos, 2 miembros,
0 campañas, 26 leads, 0 enlaces, 0 eventos, **0 proyectos sin dueño**. Todo lo que
crearon las pruebas y las capturas quedó borrado.

Las 46 capturas viven en `/root/repos/goossip-ventas-20260915/capturas-c4/` en el
servidor — 13 MB de PNG no entran al repo. Lo que sí se versiona es
`capturas-c4/resumen.json` y `capturas-c4/barrido-clerk.json`, que son la medición.

## El caso que debe fallar

Desconfiando del 100%: se le quitó a mano el `capability: 'administrar'` al
`DELETE` de campañas (se dejó en `'operar'`), se **reconstruyó** y se volvió a
correr la suite → **4 fallidas**, exactamente las del candado de borrado: el
editor borró (200 donde debía ser 403), la campaña dejó de existir, y el borrado
del dueño se volvió 404 porque ya no había nada que borrar. Restaurado y verde
otra vez: **123, 0 fallidas**.

La primera vuelta de esa prueba dio un falso verde porque el servidor seguía
sirviendo un build viejo — la misma trampa de la corrida 3. Vale el número de
después de matar el proceso y levantarlo con el build nuevo; el `lstart` del
proceso se comparó contra la fecha de `.next/BUILD_ID`.

## Qué quedó construido

### 1 · El menú lateral, de raíz

El bug que señaló Luis era estructural: la lista de navegación vivía en una caja
con altura propia y, entre el logo, un botón gigante y dos selectores, le
quedaban unos 40 px. Se ve un item y un scroll de juguete.

Ahora el menú entero es `flex-direction: column` de `100dvh`. La cabecera (logo,
organización, selector de proyecto) y el pie (usuario y escudo) piden su altura
natural y no se mueven. En medio, **una sola** caja `flex-1 min-h-0
overflow-y-auto` se lleva todo lo que sobra. Dentro de ella no hay ninguna otra
caja con scroll ni ninguna altura máxima. El único elemento con scroll propio es
el desplegable de proyectos, que es `absolute` y flota encima: si creciera dentro
del flujo, veinte proyectos volverían a comerse la navegación, que es justo el
bug que se vino a arreglar.

Medido: a 1440×900 caben los 15 renglones **sin scroll**; a 1280×720 hay
**exactamente una** caja con scroll y es el `<nav>`.

### 2 · Ancho ajustable y plegado, los dos guardados

Arrastre en el borde derecho, de 200 a 320 px. Plegado a 64 px, solo íconos, con
el nombre en el globito del navegador al pasar el ratón y los badges convertidos
en punto.

Dos decisiones que no se ven y que importan:

- **El ancho no vive en el estado de React**: vive en una variable CSS del
  `<html>`. Arrastrar mueve la variable directo, sin volver a renderizar el árbol
  sesenta veces por segundo.
- **El plegado tampoco lo pinta React**: lo pinta CSS mirando
  `html[data-sidebar]`, y lo deja puesto un `<script>` que corre **antes del
  primer pintado**. Así el menú nace plegado en el primer frame, sin ese
  parpadeo de "se abre y se cierra" en cada navegación, y sin el error de
  hidratación de leer `localStorage` durante el render.

En celular no aplica ninguna de las dos: el cajón es el de siempre.

### 3 · La estructura del menú

Organización (selector de Clerk, con el engrane de sus ajustes al lado) →
proyecto (con **"Nuevo proyecto"** adentro del selector) → las secciones de ese
proyecto: Inicio · Leads · Conversaciones · Campañas · Contenido ·
Automatizaciones · Conocimiento · **Asistente** (el chat, como una sección más) →
separador y etiqueta "Proyecto": Conexiones · Equipo · Ajustes → pie con el
usuario y, solo si `users.is_admin`, el escudo a `/admin`.

**Badges con números reales**, `count(*)` del proyecto activo, y cero no se
pinta: Leads (sin contactar), Conversaciones (abiertas), Automatizaciones
(esperando visto bueno). Conexiones lleva un punto verde / ámbar / rojo según
cuántos canales conectables estén conectados. Se piden a
`/api/projects/<id>/badges` cuando cambia el proyecto **y** cuando cambia la
ruta, así mover un lead apaga su badge sin recargar; no hay `setInterval`,
porque una pestaña abierta toda la tarde no tiene por qué pegarle a la base cada
treinta segundos para pintar un número que nadie está mirando.

**Se fue** el botón gigante de "Nuevo chat", la lista de "Redes conectadas" con
puntitos, "Mi organización" suelto y la etiqueta PRO. El item activo se marca con
fondo (`fill-ghost-selected`), no con una barrita de color al borde — plegado, esa
barrita quedaba pegada al ícono como un defecto de pintura.

### 4 · Campañas en PLURAL

Un proyecto tiene **muchas** campañas. Tabla nueva `marketing_campaigns`
(`org_id`, `project_id`, `name`, `objective`, `status`, `channels`, `budget`,
`meta_refs`, `starts_at`, `ends_at`) y `sales_leads.marketing_campaign_id`
nullable para la atribución.

La sección Campañas del proyecto es lista + alta + detalle. **"Nueva campaña"
vive SOLO ahí**, nunca en el menú lateral: el botón del menú es "Nuevo proyecto".
Hay una prueba que lo fija.

Cinco objetivos (traer leads, abrir conversaciones, llevar gente al sitio, que me
conozcan, vender) y cuatro estados (borrador, activa, en pausa, terminada). Ni
uno más: cada etiqueta que se inventa es una pregunta más que le hace el panel a
quien lo mira.

### 5 · La atribución, que es de lo que sirve todo esto

Al dar de alta la campaña se eligen sus formularios de lead ads de Facebook.
Cuando entra un lead por el webhook de Meta, se busca qué campaña tiene ESE
formulario en sus `meta_refs` y el lead se cuelga de ella. Si ninguna lo reclama
entra **sin campaña** — inventarle una arruinaría el único número que la sección
existe para dar.

Borrar una campaña **no se lleva sus leads**: la llave foránea es `SET NULL`. Lo
que se borra es la pauta, no la gente. Hay una prueba que cuenta los leads antes
y después.

### 6 · El texto

Cero inglés y cero maquinaria en lo que ve el cliente, medido sobre 78 pantallas
y sobre el texto renderizado de 24 capturas. Esta corrida encontró y quitó ocho
que seguían vivos en las pantallas de entrada, que la corrida 3 no barrió:

- *"volver a tu **dashboard**"*, *"WhatsApp con **auto-reply** opcional"* y *"Tu
  propia base de datos en **Neon**"* en `/sign-in`.
- *"**Early access** · gratis"*, *"Sin **lock-in**"*, *"Tu **DB Neon** · sin
  lock-in"* y *"**Cron** 24/7 en **Vercel**"* en `/sign-up`.
- *"Usa la página directa de **Clerk**"* en las dos, y tres *"**Clerk** no está
  configurado"* en las pantallas de organización.

## Decisiones que se apartan del issue, y por qué

- **La tabla del proyecto se sigue llamando `campaigns`, y el renombre a
  `projects` NO se hizo.** El propio issue lo deja abierto ("si el renombre
  completo no cabe en esta corrida, mínimo: UI dice Proyecto en todos lados, y
  `marketing_campaigns` existe con su sección funcional"), y es lo que se
  entrega. `ALTER TABLE campaigns RENAME TO projects` en una base de producción
  pide tocar doce llaves foráneas, doce índices y `sales_leads.campaign_id`
  —que es `NOT NULL` y está en cuatro rutas vivas— para no comprar ni una función
  nueva. Lo que sí se compró es que la palabra deje de ser ambigua: en la base
  conviven `campaigns` (el proyecto, por historia) y `marketing_campaigns` (la
  campaña), y en el código hay un alias `projects = campaigns` y un comentario en
  las dos tablas diciendo cuál es cuál. En la UI, "proyecto" en todos lados.

- **`sales_leads.campaign_id` no se renombró a `project_id`.** Por lo mismo, y
  porque la atribución por campaña viaja en una columna **aparte**
  (`marketing_campaign_id`) que es nullable a propósito: un lead del formulario
  del sitio no viene de ninguna pauta.

- **El menú conserva un bloque "Organización"** con Todos los proyectos,
  Prospección, Competencia y Calendario. El spec no lo pide, pero son cuatro
  pantallas que funcionan y sin ese bloque se quedaban sin ninguna puerta. Va
  abajo del bloque "Proyecto", con la misma gramática visual, para que se lea lo
  que es: herramientas de la organización, no secciones del proyecto. Lo que sí
  se fue, como pedía el issue, es **"Mi organización" suelto** entre las
  secciones del proyecto: sus ajustes ahora son un engrane junto al selector de
  organización, que es donde alguien los busca.

- **El presupuesto se escribe en pesos mexicanos.** La columna no guarda moneda y
  el issue no la pide. Se formatea con `Intl.NumberFormat('es-MX', MXN)` en **un
  solo lugar** (`components/marketing/campaign-bits.tsx`), así que el día que
  haya un cliente facturando en dólares se agrega la columna `currency` y se
  cambia esa función, no catorce pantallas.

- **El globito con el nombre al plegar lo pinta el navegador (`title`), no CSS.**
  Se intentó con uno propio y la captura lo enseñó **cortado**: la zona de
  navegación scrollea, y en CSS eso obliga a recortar también en horizontal. El
  del navegador se pinta fuera del documento y no lo recorta nadie. De pilón
  sirve también con el menú abierto, donde caza los nombres largos que el
  `truncate` deja a medias.

- **El punto de Conexiones no le pregunta a Composio.** `projectConnections` sale
  a la red a ver si LinkedIn sigue vivo; los badges usan `buildChannelCards`, que
  solo mira la base. Un punto de color no vale una llamada a un tercero cada vez
  que alguien cambia de proyecto en el menú; la verdad fina se mide al entrar a
  Conexiones.

- **El cajón de celular pasó a ser opaco.** Está vestido de `glass` (blanco al
  70 %), que se ve bien pegado a la columna de escritorio y encima del contenido
  se vuelve ilegible: en la captura de móvil se leían los números del panel
  ATRAVESADOS entre los renglones del menú. Es una línea, no toca el tab bar y
  el issue pedía explícitamente no romper el celular.

## Dos cosas que se encontraron y se arreglaron de paso

**1. Un proyecto en producción sin dueño, y la ruta que lo creaba así.**
Al correr la suite de la corrida 3 salió `proyectos sin dueño: 1` — el proyecto
"goossip", creado el 16-sep a las 07:13, diez minutos después de mergear la
corrida 3, con **0 miembros y 0 eventos**. La causa raíz: `POST /api/campaigns`
(la ruta vieja) daba de alta el proyecto por su propio camino,
`lib/campaigns.createCampaign`, que insertaba la fila y se acababa ahí — sin
`project_members` y sin bitácora. No se notaba porque quien manda en la
organización es dueño implícito de todos sus proyectos; se habría notado el día
que ese proyecto pasara a manos de alguien que no es `org:admin`: nadie podría
entrar.

Se cerró de raíz: `lib/campaigns.createCampaign` **se borró** (dos funciones que
dan de alta lo mismo vuelven a separarse siempre) y `/api/campaigns` ahora pasa
por `createProject`, el único camino. `scripts/seed-vliving.ts` tenía el mismo
descuido y también se corrigió. El proyecto huérfano se backfilleó con el mismo
criterio de la 0014 (`campaigns.user_id`): **0 proyectos sin dueño**. Y hay una
prueba HTTP nueva que da de alta por la ruta vieja y comprueba que nazca con su
dueño y su evento.

**2. La migración 0014 estaba aplicada pero sin su marca.**
`__migrations` no tenía la fila de `0014_proyecto_centro.sql` — es el resto de la
prueba de idempotencia de la corrida 3, que borró la marca para volver a
correrla. Con la base como quedó, volver a aplicarla revienta contra
`social_accounts_project_platform_uniq`, así que **ninguna migración nueva podría
correr nunca**. Se comprobó primero que 0014 sí estuviera aplicada (3 tablas, 12
índices, 9 columnas nuevas, `social_accounts.user_id` nullable — todo medido) y
se insertó la fila que faltaba. Después de eso, 0015 aplicó limpio.

## Lo que falta y depende de Luis

1. **La URL de retorno de Goossip sigue sin estar en Facebook Login.** En la app
   "V&Living MCP" → Facebook Login → *Valid OAuth Redirect URIs*, agregar
   `https://vliving.life/api/connections/meta/callback`. Sin eso el botón
   "Conectar" lleva a la pantalla de "URL bloqueada". Es el paso que abre la
   atribución de esta corrida: sin Meta conectado, las campañas existen pero
   nadie les cuelga leads solo.
2. **`npm run db:migrate` contra producción después de mergear**, para 0015.
3. **Quitar el "Secured by Clerk" no se puede desde código en este plan.**
   Vuelto a medir el 16-sep: `PATCH /v1/instance` con `branded:false`,
   `clerk_branding:false` y `show_clerk_branding:false` devuelve **204** las tres
   veces y el entorno sigue contestando `display_config.branded = true`. El sello
   **se ve** en `https://vliving.life/sign-in` (captura
   `capturas-c4/clerk-prod-sign-in.png`). Taparlo con CSS sería violar los
   términos de Clerk. Es un botón del plan de pago. El resto del punto sí quedó:
   Clerk habla español, medido sobre el widget montado en producción.
4. **`CLERK_WEBHOOK_SECRET` en Vercel** y el webhook dado de alta en Clerk.
5. **`COMPOSIO_API_KEY` y `DATABASE_URL` en el entorno Preview de Vercel** —
   pendiente desde la corrida 1.
6. Siguen abiertos los bloqueos de la corrida 1: WABA en Business Manager,
   `ads_management`, Twilio fuera de Trial, y `META_VERIFY_TOKEN` /
   `WHATSAPP_VERIFY_TOKEN` / `META_PAGE_TOKEN_V_LIVING` en el env de Vercel.

Nota: los textos en inglés de `/sign-in` y `/sign-up` que se arreglaron en esta
corrida **siguen vivos en producción** hasta que se mergee y despliegue: la
medición de arriba se hizo contra `vliving.life`, que corre el build de la
corrida 3.

## Siguiente acción

Mergear este PR y correr `npm run db:migrate` contra producción. Después, el
paso que sigue abriendo todo lo demás: dar de alta
`https://vliving.life/api/connections/meta/callback` en Facebook Login. Con eso,
Luis crea una campaña en V&LIVING, le amarra el formulario "All living", y cada
lead que entre por ese anuncio aparece contado en ESA campaña — que es la
pregunta que nadie podía contestar hasta hoy: cuál de mis pautas me está
trayendo gente.

La adaptación del menú nuevo a celular queda para la corrida 5, como se acordó.
