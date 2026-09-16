# GOOSSIP CORRIDA 3

```
GOOSSIP CORRIDA 3
Alta de proyecto: OK · pasos: 3
Conexiones por proyecto: 4 canales reales conectables · notas internas visibles: 0
Invitaciones: roles 4 · enlace de conexión: OK (probado 1 uso + expiración)
Pantallas tocadas: 18 · capturas móvil/escritorio: 36 (+ 4 del flujo de alta)
Build: OK · PR: #35
Bloqueos de Luis: [dar de alta la URL de retorno de Goossip en Facebook Login | CLERK_WEBHOOK_SECRET + alta del webhook en Clerk | COMPOSIO_API_KEY y DATABASE_URL faltan en el entorno Preview | quitar "Secured by Clerk" necesita plan de pago (medido: la API lo acepta y no lo aplica) | los widgets de Clerk solo montan en vliving.life | WABA en Business Manager | Twilio fuera de Trial]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Migración `0014_proyecto_centro.sql` | `npm run db:migrate` | `-> applying 0014_proyecto_centro.sql` · `Migrations up to date.` |
| Tablas nuevas | `information_schema.tables` | **3/3**: `project_members`, `connection_links`, `project_events` |
| Columnas nuevas de proyecto | `information_schema.columns` | **3/3**: `website`, `city`, `country` |
| `social_accounts.user_id` opcional | `information_schema.columns` | `is_nullable = YES` |
| Backfill de dueños | `count(*)` de proyectos sin fila `dueño` | **0 proyectos sin dueño** |
| Backfill de conexiones | 6 filas de `social_accounts`, 1 proyecto | **3 amarradas al proyecto**, 3 duplicadas de (proyecto, canal) quedaron sin proyecto en vez de reventar el índice |
| Idempotencia de la migración | borrar la fila de `__migrations` y volver a correrla | segunda corrida: **1 miembro, 3 conexiones** — los mismos números, 0 filas nuevas |
| Aislamiento entre proyectos — datos | `test/projects.test.ts`, 2 proyectos de la MISMA org | el invitado ve **1 de 2**; el otro ni aparece en la consulta |
| Rol `conector` — HTTP | sesión real de Clerk contra el servidor construido | Conexiones **200** · Equipo **403** · enlaces **403** · invitar **403** · editar proyecto **403** · proyecto ajeno **403** |
| El 403 no es un "niega siempre" | al mismo usuario se le pone `dueño` y se repite la misma petición | `/members` → **200**; al devolverle `conector`, **403** otra vez |
| Rol en las APIs viejas de ventas | el `conector` intenta mover una etapa, dar de alta un lead y probar el vendedor | **403** en las tres · el lead **sigue en `nuevo`** |
| …y con rol de editor | la MISMA petición | **200** y el lead **de verdad se movió a `cerrado`** |
| Enlace de conexión — un solo uso | crear, mirar dos veces, quemar, quemar otra vez | mirarlo **no lo gasta** · primer uso **OK** con `used_by` y `used_at` · segundo uso **`usado`** · la fila **no se pisa** |
| Enlace de conexión — expiración | uno nacido hace 4 días | **`expirado`**, y no se puede quemar |
| Enlace de conexión — cancelado / inventado | revocar uno y pedir un token al azar | **`cancelado`** / **`no_existe`** |
| El token no vive en la base | comparar `token_hash` contra el token en claro | distintos · en la base solo el **sha256** · token de **43 caracteres** |
| Alta de proyecto por la UI | WebKit 1440, 3 pasos llenados a mano, y después `select` contra la base | proyecto creado: nombre `Zuxen Residencial`, ciudad `Guadalajara`, sitio `https://zuxen.mx`, vendedor definido, **1 dueño** |
| Notas internas — código | barrido de 75 pantallas contra 16 palabras de jerga | **0** |
| Notas internas — pantalla renderizada | `document.body.innerText` de 18 pantallas × 2 tamaños contra 31 palabras | **0** |
| El detector de jerga de verdad detecta | se le dan los textos viejos a mano | el 401 de Google Ads → `api key, request_id` · la nota de Composio → `composio` · la del bridge → `bridge` · pantalla limpia → nada |
| Meta — app viva | `GET /v21.0/app` con app token | **200** · `1319044377088418` "V&Living MCP" |
| Meta — páginas | `GET /me/accounts` | **1 página**: `1173019489236259` V&living |
| Meta — formularios de lead ads | `GET /<page>/leadgen_forms` con el token de la página | **1 formulario**: `2146578942620117` "All living", ACTIVE, **26 leads** |
| Quitar "Secured by Clerk" | `PATCH /v1/instance` con `branded`, `clerk_branding` y `show_clerk_branding` | **204 las tres veces**, y el entorno sigue en `display_config.branded = true`. No se puede desde código |
| Clerk en español | `@clerk/localizations@4.17.1` + `localization={esMX}` | instalado y montado |
| Pruebas de la corrida 3 | `npm run test:projects` con `GOOSSIP_TEST_BASE_URL` | **97 pasadas, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` | **89 pasadas, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Caso que DEBE fallar | se quitó a mano el `canSeeSection` de `resolveProject`, se reconstruyó y se volvió a correr | **3 fallidas**, justo las tres del candado de sección. Restaurado y verde otra vez |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 6.0s` |
| UI | WebKit 390×844 y 1440×900, 18 pantallas | **36 capturas**, **36 con HTTP 200**, **0 errores de JS**, **0 notas internas** |

Estado de la base al cerrar: 1 organización, 2 usuarios, 1 proyecto, 1 miembro de proyecto, 26 leads, 0 enlaces, 0 eventos. Todo lo que crearon las pruebas y las capturas (orgs, usuarios de Clerk, proyectos, leads, conexiones y enlaces) quedó borrado.

Las 36 capturas viven en `/root/repos/goossip-ventas-20260915/capturas-c3/` en el servidor — 15 MB de PNG no entran al repo. Lo que sí se versiona es `capturas-c3/resumen.json`, que es la medición.

## Qué quedó construido

**1. El proyecto es la unidad central.** El menú, de arriba abajo, es ahora la arquitectura: organización (Clerk) → proyecto → sus diez secciones. Antes era una lista plana de quince módulos con el proyecto de adorno en un chip. `/dashboard` dejó de ser pantalla y es un desvío al proyecto activo; sin proyectos lleva al alta, no a un panel vacío.

**2. Migración `0014_proyecto_centro.sql`**, aplicada en Neon.
`project_members` (quién entra y con qué rol), `connection_links` (enlaces de un solo uso, del token solo el sha256) y `project_events` (la bitácora: quién conectó, revocó, invitó y cambió qué). `social_accounts` gana `campaign_id`, `connected_by`, `connected_at`, `label` y `external_id`, y su `user_id` pasa a ser opcional. `campaigns` gana `website`, `city` y `country`.

**3. Cuatro roles POR PROYECTO**, distintos de los de la organización: `dueño` (todo), `editor` (leads, conversaciones, contenido), `conector` (solo canales) y `lector` (mira). Quien manda en la org es dueño implícito de todos sus proyectos y no necesita fila — si la necesitara, un administrador recién invitado entraría a su propia org sin poder ver nada.

**4. Alta en tres pasos (`/projects/new`)**: qué es · cómo vende · conexiones. El proyecto se crea de verdad al terminar el paso 1, no al final: el issue pide poder guardar a la mitad, y el paso 3 conecta canales, que necesitan un proyecto al que colgarse. Quien cierra la pestaña se encuentra su proyecto hecho.

**5. Conexiones del proyecto (`/projects/[id]/conexiones`)**, que reemplazan a `/integrations`. Ocho canales en orden de valor — Meta, WhatsApp, Google, LinkedIn, X, TikTok, sitio web, catálogo — con **un solo sistema de etiquetas**: Conectado / Sin conectar / Próximamente. Cada tarjeta dice quién la conectó y cuándo. Conectables de verdad hoy: Meta (OAuth completo), WhatsApp, el formulario del sitio y el catálogo; LinkedIn se suma en producción, donde sí hay llave de Composio.

**6. Meta con OAuth propio, no prestado.** `META_APP_ID` y `META_APP_SECRET` ya vivían en el entorno y están vivos, así que el baile completo es nuestro: permiso → token de 60 días → lista de páginas → el usuario elige la suya → formularios de lead ads → suscripción de la página al webhook de leads. El `state` va firmado con HMAC: sin firma, cualquiera cambiaría el `project_id` y engancharía la página de un cliente al proyecto de otro.

**7. Equipo e invitaciones (`/projects/[id]/equipo`).** Invitar manda la invitación de **Clerk** con `{project_id, project_role}` en la metadata; al aceptar, la persona entra a la org como `org:member` y queda en ESE proyecto con ESE rol. Goossip no manda su propio correo de invitación: serían dos verdades sobre quién pertenece a la org.

**8. Enlace de conexión de un solo uso.** "Pídele a alguien que conecte su Facebook": un enlace de 72 h que lleva a una pantalla con una frase y un botón, sin menú ni leads ni nada más de Goossip. El community manager del cliente entra, da permiso y se acabó. Se quema en el callback, no al abrirlo — un prefetch del navegador o el antivirus del correo lo dejarían inservible antes de que la persona llegue.

**9. Inicio del proyecto con lista de arranque y números reales.** Conectar Meta → elegir formulario → definir vendedor → invitar equipo → primer lead, cada paso con su estado **medido**, no guardado: una bandera "ya conectó Meta" se queda mintiendo el día que alguien revoca el permiso desde Facebook. Los números son `count(*)` de ese proyecto y cero se muestra como cero.

**10. El formulario del sitio del cliente entra al pipeline.** `POST /api/webhooks/site/<token>` acepta JSON y también el `x-www-form-urlencoded` de un `<form>` de toda la vida, y reconoce el campo del teléfono lo llame como lo llame.

**11. Cero notas internas, barrido completo.** Se fueron `/analytics`, `/audience` y `/whatsapp` (tres pantallas que solo existían para decir que no existían todavía) y las notas de `/integrations` ("falta registrar la app de Gmail en Composio", "hoy corre sobre un bridge interno", "requiere app de developer propia"). La portada dejó de enseñar la maquinaria — "Cron en Vercel", "Postgres en Neon bajo tu cuenta", "Claude Sonnet donde importa", "Tu propia DB Neon" — y sus tarjetas de canales salen del mismo catálogo que la app, así que ya no puede prometer WhatsApp y no prometer Facebook, que es justo al revés de lo que funciona.

**12. Clerk en español mexicano** (`esMX` de `@clerk/localizations`).

## Decisiones que se apartan del issue, y por qué

- **Los tokens de Meta SÍ se guardan, cifrados.** La corrida 1 decidió que ningún token va a la tabla, y era lo correcto mientras los ponía Luis a mano en Vercel. Con OAuth de verdad ya no se puede: el token de la página lo emite Meta en mitad del flujo, con la sesión del usuario, y nadie va a copiarlo a un panel. Se guarda con AES-256-GCM (`lib/secret-box.ts`) y **jamás sale por una API** — hay una prueba que lo fija. La llave sale de `CONNECTIONS_SECRET` y, si no está, **se deriva de `META_APP_SECRET`**: quien tenga el app secret de Meta puede emitir tokens de esa app por su cuenta, así que cifrar tokens de Meta con él no abre ninguna puerta nueva, y evita que la función se quede muerta esperando un secreto más. El de env sigue funcionando como respaldo.

- **El token del formulario del sitio sí va en claro.** Es la URL que el cliente pega en su página: tiene que poder verla. No es la credencial de un tercero, es la puerta que Goossip le genera y que puede rehacer de un botón.

- **El `conector` no ve NI el inicio del proyecto.** El issue pide "solo ve Conexiones y 403 en lo demás", y así quedó, literal. Al llegar a otra sección no se topa con un 404 confuso: se le dice en una línea qué rol tiene y se le da el botón a lo suyo.

- **Un proyecto que no es tuyo da 404 si es de otra org y 403 si es de la tuya.** Decirle "no puedes" a alguien de fuera confirmaría que el proyecto existe.

- **Las APIs viejas de ventas también pasan por el rol del proyecto.** No estaba en el issue y era un agujero real: la pantalla no le ofrecía el botón al `lector`, pero `PATCH /api/sales/leads/<id>` sí le contestaba, porque entrar a la sección deja ese proyecto activo. Se cerró en `/api/sales/leads`, `/api/sales/leads/[id]`, `/api/sales/seller` y `/api/queue/[id]`, con pruebas en los dos sentidos.

- **Entrar a un proyecto es elegirlo.** `enterProject` lo deja activo para ese (usuario, org), y solo escribe cuando cambia. Así el pipeline, la cola y el conocimiento de las corridas 1 y 2 siguen funcionando tal cual, sin una segunda implementación que se iría separando de la primera.

- **Las rutas viejas no se rompen, se desvían.** `/leads`, `/automations`, `/knowledge`, `/posts`, `/campaigns`, `/ads`, `/integrations` y `/whatsapp` llevan a la sección equivalente del proyecto activo. Hay enlaces guardados, correos y marcadores apuntando ahí.

- **La tabla del proyecto se sigue llamando `campaigns`.** Renombrarla en producción pediría tocar doce llaves foráneas y no compra nada. En la app se llama proyecto en todos lados, y "campaña" volvió a significar lo único que siempre significó para quien vende: la pauta que trae gente.

- **`memberCounts` cuenta también a los invitados que no han entrado.** Es lo mismo que enseña la pantalla de Equipo, y dos números distintos para lo mismo en dos pantallas distintas es como se pierde la confianza en un panel.

- **Playwright se carga por ruta absoluta.** En este servidor hay dos copias y la resolución normal de Node encuentra primero la vieja, que pide un WebKit que ya no está. No se corrió `playwright install` para arreglarlo: instalar una versión borra los navegadores de las otras (pasó el 02-sep).

## Lo que falta y depende de Luis

1. **La URL de retorno de Goossip no está dada de alta en Facebook Login.** El OAuth está completo y probado contra Graph en todo lo que se puede probar sin sesión de usuario — la app vive, `me/accounts` contesta, `leadgen_forms` devuelve el formulario real con sus 26 leads. Lo que falta es un paso del panel de Meta: en la app "V&Living MCP" → Facebook Login → *Valid OAuth Redirect URIs*, agregar `https://vliving.life/api/connections/meta/callback`. Sin eso, el botón "Conectar" lleva a la pantalla de "URL bloqueada" de Facebook. **No lo hice yo**: tocar los ajustes de una app de Meta en producción es llamada de Luis. Medido: Facebook no valida el `redirect_uri` antes del login, así que desde aquí no se puede comprobar si ya está — hay que mirarlo en el panel.

2. **Quitar el "Secured by Clerk" no se puede desde código en este plan.** Medido el 16-sep: `PATCH /v1/instance` con `branded:false`, `clerk_branding:false` y `show_clerk_branding:false` devuelve **204** las tres veces y el entorno sigue contestando `display_config.branded = true`. Taparlo con CSS sería violar los términos de Clerk. Es un botón del plan de pago, no una línea de código. El resto del issue en ese punto sí quedó: Clerk está en español (`esMX`).

3. **`CLERK_WEBHOOK_SECRET` sigue sin estar en Vercel** y el webhook sigue sin darse de alta en Clerk. Esta corrida le agregó el evento `organizationInvitation.accepted`, que es el camino rápido para cerrar una invitación a un proyecto. **Mientras tanto la app no se rompe**: si el webhook no llegó, la invitación se cierra sola la primera vez que la persona entra con ese correo.

4. **El entorno Preview de Vercel sigue sin `COMPOSIO_API_KEY` ni `DATABASE_URL`** — pendiente desde la corrida 1.

5. **En este entorno `COMPOSIO_API_KEY` viene como `[SENSITIVE]`**, así que LinkedIn y Google Ads salen "Próximamente". En producción, donde la llave sí está, LinkedIn conecta y Google Ads aparece. Es el mismo código mirando el entorno real, no dos comportamientos distintos.

6. **Los widgets de Clerk solo montan en `vliving.life`** (medido en la corrida 2). El selector de organización se ve vacío desde `127.0.0.1` y desde los previews; en producción monta.

7. Siguen abiertos los bloqueos de la corrida 1: WABA en Business Manager, `ads_management`, Twilio fuera de Trial, y `META_VERIFY_TOKEN` / `WHATSAPP_VERIFY_TOKEN` / `META_PAGE_TOKEN_V_LIVING` en el env de Vercel.

## Siguiente acción

Mergear este PR y correr `npm run db:migrate` contra producción. Después, el paso que abre todo lo demás: dar de alta `https://vliving.life/api/connections/meta/callback` en Facebook Login de la app "V&Living MCP". Con eso Luis entra a `vliving.life`, aprieta "Conectar" en Facebook e Instagram, elige la página V&living, elige el formulario "All living" y los leads empiezan a entrar solos — sin que nadie vuelva a copiar un token a mano.
