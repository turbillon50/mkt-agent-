# GOOSSIP CORRIDA 2

```
GOOSSIP CORRIDA 2
Organizations: ACTIVO — habilitado por la Backend API, no queda ningún botón pendiente
Org all-global: creada · owner turbillon50@gmail.com · miembros: 2
Migración: filas con org_id 169/169 · huérfanas: 0
/admin: OK · pantallas: 4 (Organizaciones · Usuarios · Cola global · Salud)
Aislamiento entre orgs: probado (32 casos)
Build: OK · PR: #34 · preview: https://goossip-i2o5qphzz-luis-projects-48b011f9.vercel.app
Bloqueos de Luis: [CLERK_WEBHOOK_SECRET + alta del webhook en Clerk | los widgets de Clerk solo montan en vliving.life | COMPOSIO_API_KEY y DATABASE_URL siguen faltando en el entorno Preview | plan de Clerk para el rol org:owner de verdad]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Habilitar Organizations | `PATCH https://api.clerk.com/v1/instance/organization_settings {"enabled":true}` | **200** · `enabled:true`. Antes: `GET /v1/organizations` → **403 `organization_not_enabled_in_instance`** |
| Slugs de org | `PATCH … {"slug_disabled":false,"max_allowed_memberships":20}` | **200** · `slug_disabled:false` |
| Rol `org:owner` en Clerk | `POST /v1/organization_roles` con `org:owner` | **402 `unsupported_subscription_plan_features`**, `unsupported_features:["org:roles"]`. Por eso se deriva (ver más abajo) |
| Org `all-global` | `POST /v1/organizations` | `org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N` · slug `all-global` · `created_by` = turbillon50 |
| Membresías | `GET /v1/organizations/<id>/memberships` | **2/2**: `turbillon50@gmail.com` y `luisdelator@vmomentums.info` |
| Migración 0013 | `npm run db:migrate` | `-> applying 0013_organizations.sql` · `Migrations up to date.` |
| Filas migradas | `count(*)` y `count(org_id)` por tabla, antes y después | **169/169** con `org_id` · **0 huérfanas** |
| `sales_leads` bajo `all-global` | `count(*) where org_id = <all-global>` vs `count(*)` | **26/26** |
| `org_id NOT NULL` | `information_schema.columns` en las 12 tablas | **12/12** en `NO` |
| Idempotencia de la migración | borrar la fila de `__migrations` y volver a correrla | segunda corrida limpia, sin duplicar ni una fila |
| Aislamiento — capa de datos | `test/orgs.test.ts`, dos orgs y dos usuarios reales de Clerk | **19 casos**, 0 fallas |
| Aislamiento — HTTP | el mismo archivo, contra el servidor construido con sesiones reales | **13 casos**, 0 fallas |
| No-admin en `/admin` | 6 APIs + la página, con sesión real de un usuario sin `is_admin` | **403** en las 6 · la página **307 → `/dashboard`** |
| El 403 no es un "niega siempre" | al mismo usuario se le pone `is_admin` y se repite | `/api/admin/orgs` → **200** y sí ve la org ajena |
| Org suspendida | `status='suspended'` y se pide `/api/projects` | **403** con `problem: "org_suspended"` |
| Webhook de Clerk | 9 payloads firmados contra el servidor construido | sin firma **401** · firma alterada **401** · replay de 1 h **401** · los 5 eventos **200** · evento ajeno **200 ignorado** |
| Bitácora del webhook | `select … from webhook_log` | 9 filas: 3 `rejected` con su motivo, 6 `ok` |
| Pruebas de ventas (corrida 1) | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Pruebas de orgs | `npm run test:orgs` con `GOOSSIP_TEST_BASE_URL` | **89 pasadas, 0 fallidas** |
| Caso que DEBE fallar | se quitó a mano el `and(org_id)` de `getProject` y se volvió a correr | **2 fallidas**, justo las dos de aislamiento cruzado. Restaurado |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 5.6s` |
| UI | WebKit 390×844 y 1440×900 · `/admin` `/projects` `/leads` `/organizacion` `/dashboard` | **10 capturas**, todas **200**, **0 errores de JS de la app** |
| Preview | `vercel deploy` sobre la rama | `readyState: READY` |

Estado de la base al cerrar: 1 organización, 2 usuarios, 2 membresías, 1 proyecto, 26 leads, 0 huérfanas. Todo lo que crearon las pruebas (2 orgs, 2 usuarios de Clerk, sus proyectos y sus leads) quedó borrado.

## Qué quedó construido

**1. Organizations habilitado de verdad.** No hay botón pendiente: el toggle se movió desde la Backend API. `CLERK_ORGS_ENABLED` existe y viene encendida, pero no es el modo normal — es la salida de emergencia: en `false`, la app deja de exigir `orgId` en el token y resuelve el tenant por el espejo de membresías en vez de caerse.

**2. Migración `0013_organizations.sql`**, aplicada en Neon.
`org_id text not null` + índice en `campaigns`, `sales_leads`, `sales_lead_events`, `conversations`, `messages`, `action_queue`, `social_accounts`, `knowledge`, `posts`, `plan_items`, `competitor_links` y `leads`. Nuevas: `organizations` y `org_memberships` (espejo de Clerk) y `webhook_log` (el pulso de la app). `users` gana `last_seen_at`.

**3. Aislamiento con dos candados.** `proxy.ts` (el middleware, que en Next 16 se llama así) exige `orgId` en el token para todo el dashboard y sus APIs: las páginas se van a `/onboarding`, las APIs contestan **403** — un `fetch` no se redirige, se le dice que no. Y por debajo, **toda** consulta filtra por `org_id`. Esconder un link nunca fue protección.

**4. `/admin`, el módulo de administración de la app.** Reemplaza y absorbe a `/agency`, que quedó borrado. Cuatro pestañas: **Organizaciones** (lista, búsqueda, detalle con miembros, proyectos, canales conectados y uso del mes; cambiar plan; suspender/reactivar; borrar), **Usuarios** (a qué orgs pertenece, último acceso, dar/quitar `is_admin`), **Cola global** (pendientes de todas las orgs, con filtro por org y por estado) y **Salud** (webhooks de las últimas 24 h por fuente, errores recientes y versión desplegada). Navegable en móvil: las pestañas hacen scroll y las tablas son tarjetas.

**5. La app del usuario, dentro de su org.** `/projects`, `/leads`, `/automations`, `/campaigns`, `/knowledge`, `/posts` y la cola: todo filtrado por org + proyecto activo. El proyecto activo se guarda por **(user, org)**: el mismo usuario puede estar parado en V&LIVING en una org y en otro proyecto en la de al lado.

**6. Webhook `/api/webhooks/clerk`.** `organization.created/updated/deleted` y `organizationMembership.created/updated/deleted`. Firma Svix verificada a mano en tiempo constante, con ventana de 5 minutos contra replays. Siempre **200** cuando la firma es buena, aunque adentro truene: un 5xx haría que Svix reintente en bucle. Lo que falló queda en `webhook_log` y se ve en la pestaña de Salud.

**7. `OrganizationSwitcher` y `OrganizationProfile`.** El switcher va en el shell, arriba del selector de proyecto: primero se elige el tenant, luego el proyecto dentro de él. Las invitaciones viven en `/organizacion` con el `OrganizationProfile` de Clerk tal cual — duplicar invitar/cambiar rol/sacar gente sería inventar una segunda fuente de verdad.

**8. `/onboarding` de dos pasos.** Primero la organización (con el `CreateOrganization` de Clerk), después el primer proyecto. Con las dos cosas, al dashboard.

## Decisiones que se apartan del issue, y por qué

- **`org:owner` no existe en Clerk: se DERIVA.** El issue pide tres roles de org. El plan gratuito no deja crear roles — `POST /v1/organization_roles` contesta **402 `unsupported_subscription_plan_features`** con `unsupported_features: ["org:roles"]`. En Clerk solo hay `org:admin` y `org:member`. Así que es dueño quien creó la org (`organizations.owner_user_id`, que Clerk llena con `created_by`), y ese rol derivado gana sobre lo que diga el token. El día que el plan suba, basta crear el rol en Clerk: `resolveOrgRole` ya lo respeta si viene en el token. El `org:member` sí opera leads y no toca canales ni facturación (`apiOrgManager`), tal como pide el issue.

- **La firma Svix se verifica a mano.** Son 30 líneas y el algoritmo está documentado; meter el SDK `svix` sería una dependencia nueva en un proyecto en producción solo para un HMAC. `lib/svix.ts`, probado con 7 casos.

- **`users.active_campaign_id` queda muerta, pero no se borra.** El proyecto activo se movió a `org_memberships.active_project_id` porque ahora es por (user, org). Tirar una columna de la base de producción no lo pidió nadie y no se puede deshacer: se queda con su dato y con el comentario de que nadie la lee.

- **El slug del proyecto pasa a ser único por ORG, no por usuario** (`campaigns_org_slug_uniq`). Es lo coherente cuando el tenant es la org: dos organizaciones distintas sí pueden tener un proyecto con el mismo nombre. Hay una prueba que lo fija.

- **El bloque de datos de la migración solo corre si ya hay usuarios.** En una base nueva no inventa una org "All Global Holding" que en ese Clerk no existiría. Las orgs reales entran por `/onboarding` y por el webhook.

- **Las tareas de sistema necesitan una org explícita.** Los crons del agente social heredado (`/api/cron/run`, `/api/cron/plan`) y el CLI no tienen sesión, pero `posts`, `knowledge` y `plan_items` ya llevan `org_id NOT NULL`. `src/orgs/system.ts` resuelve `GOOSSIP_SYSTEM_ORG_ID`, o la única org si solo hay una, y **revienta con un mensaje claro si hay varias y nadie eligió**. Escribir en el tenant de otro es peor que no escribir.

- **`/api/admin/*` dejó de ser público en el middleware.** Traía un comodín `'/api/admin/(.*)'` que dejaba abierto todo lo nuevo bajo esa ruta. Ahora se listan una por una las cuatro de mantenimiento con `CRON_SECRET` (`migrate`, `seed-soul`, `append-soul`, `backfill-embeddings`) y el resto pasa por `apiAppAdmin`.

- **Borrar una organización pide el slug escrito a mano.** El issue pide confirmación doble; un `DELETE` suelto no borra el tenant de nadie. Y se borra primero en Clerk y luego el espejo: quedarnos sin espejo y con la org viva sería peor. Medido: con el slug mal → **400**.

- **Las pruebas por HTTP autentican con `Authorization: Bearer`, no con la cookie `__session`.** Medido: con cookie desde otro dominio, Clerk contesta con su handshake (**307**, y en el navegador un bucle de 20 redirecciones) y eso taparía el código real de la ruta. Con Bearer, `/api/projects` da 200 y `/api/admin/orgs` da 403 — que es justo lo que se quiere medir.

## Lo que falta y depende de Luis

1. **`CLERK_WEBHOOK_SECRET` no está en Vercel** y el webhook no está dado de alta en Clerk. Hay que crear el endpoint en Clerk → Webhooks apuntando a `/api/webhooks/clerk`, suscribir `organization.*` y `organizationMembership.*`, y subir el `whsec_…` que dé Clerk. No lo inyecté: es un secreto nuevo en un proyecto en producción y esa llamada es de Luis. Probado en local con un secreto de prueba y firma real, 9 casos. **Mientras tanto la app no se rompe**: si el webhook no llegó, el espejo de la org se crea al vuelo la primera vez que alguien entra.

2. **Los widgets de Clerk solo montan en `vliving.life`.** La instancia es de producción y su único dominio registrado es ese (`GET /v1/domains` → `vliving.life`, sin satélites). Desde `127.0.0.1` y desde `*.vercel.app` la Frontend API contesta **400** y ni el `OrganizationSwitcher` ni el `OrganizationProfile` se pintan — se ve el hueco donde van. El resto de la app funciona igual en los tres lados, y el proyecto de Vercel **ya sirve `vliving.life`**, así que en producción montan. Si Luis quiere verlos en previews, hay que dar de alta el dominio de preview como satélite en Clerk.

3. **El rol `org:owner` de verdad necesita plan de pago en Clerk** (402 medido). Hoy funciona derivado del creador.

4. **El entorno Preview de Vercel sigue sin `COMPOSIO_API_KEY` ni `DATABASE_URL`** — pendiente desde la corrida 1. El primer intento de preview de esta corrida falló por eso, en `/api/ads/campaigns`, una ruta preexistente que no toqué. El preview de arriba se levantó pasando esas variables solo para esa corrida, sin cambiar la configuración del proyecto.

5. **El preview está detrás del SSO de Vercel** (Deployment Protection). Abre con la sesión de Vercel de Luis; desde fuera devuelve 302 a `vercel.com/sso-api`.

6. Siguen abiertos los bloqueos de la corrida 1: WABA en Business Manager, `ads_management`, Twilio fuera de Trial, y `META_VERIFY_TOKEN` / `WHATSAPP_VERIFY_TOKEN` / `META_PAGE_TOKEN_V_LIVING` en el env de Vercel.

## Siguiente acción

Mergear el PR #31 (corrida 1) y luego el #34. Dar de alta el webhook de Clerk con su `CLERK_WEBHOOK_SECRET` y correr `npm run db:migrate` contra producción. Con eso el multitenant queda vivo: Luis entra a `/admin` como dueño de Goossip, y a su organización como usuario.
