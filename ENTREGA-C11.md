# GOOSSIP CORRIDA 11 — META ADS CONECTABLE CON LA APP PROPIA (SOLO LECTURA)

```
GOOSSIP CORRIDA 11 — META ADS CON APP PROPIA
Meta Ads deja de decir "Próximamente": via='meta_own_app', 4 permisos, ventana aparte + polling
Cuenta leída de verdad: act_2629053887531679 "V&LIVING Ads" · negocio 1173024692569072 V&living · MXN · Activa
Datos: leerCampañas · leerInsights(date_preset) · costoPorLead (spend / sales_leads source=meta_leadgen)
Pantalla: sección "Anuncios de Meta" en Campañas (gasto 7d/30d, CPL, campañas) + el gasto en estado-del-proyecto
Escritura: CERO. Ni una campaña, ni un peso de presupuesto.
Pruebas: 85 pasadas 0 fallidas (test:metaads) · 74 (composio) · 70 (projects) · build verde
UI: 8 capturas WebKit 1440 y 390 · 8 con HTTP 200 · 0 errores de JS · 0 notas internas
Deploy: producción READY (Vercel success) · https://goossip.vercel.app · /sign-in HTTP 200 · PR #48 MERGED en main (16-sep 15:54 UTC)
Bloqueo de Luis: dar de alta https://<dominio>/api/connections/metaads/callback en Facebook Login → Valid OAuth Redirect URIs de la app "V&Living MCP"
```

## Por qué esta corrida existe

La corrida 5 midió y decidió bien: `metaads` **no tiene auth administrada en
Composio**, así que conectarlo por allá pediría dar de alta una app de developer
propia — justo lo que esa corrida quitó de en medio. La tarjeta salió
"Próximamente" y así llevaba seis corridas.

El dato que faltaba no era de Composio: **Goossip ya tiene una app de Meta
viva**. `META_APP_ID` y `META_APP_SECRET` están en el entorno, la app se llama
"V&Living MCP", y con el token de usuario de Luis lee la cuenta publicitaria de
V&LIVING de cabo a rabo. Conectarlo no pedía registrar nada nuevo: pedía usar lo
que ya estaba.

Tener la llave en la mano y enseñar "Próximamente" es exactamente la clase de
mentira que la doctrina prohíbe. Eso es lo que se acabó.

Y lo que **no** cambió: `metaads` sigue sin auth administrada en Composio. Se
volvió a medir hoy y la prueba que lo comprueba **se queda en el repo**, para
que el día que Composio la habilite sea una prueba la que avise y no la memoria
de nadie.

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| **La cuenta existe y contesta** | `GET /v21.0/me/adaccounts` con el token de Luis | **1 cuenta**: `act_2629053887531679` "V&LIVING Ads" · negocio `1173024692569072` V&living · **MXN** · `account_status 1` (Activa) |
| **La cuenta de al lado sigue sin permiso** | `GET /v21.0/act_1719141675826755` | **`(#200) Ad account owner has NOT grant ads_management`** — está fuera del negocio. No es bug: se traduce a "pídelo en Business Manager" |
| **Un token basura** | `access_token=INVALIDO` | **`190` Invalid OAuth access token** → "Facebook cerró el permiso de esta cuenta. Vuelve a conectarla." |
| **Campañas e insights de V&LIVING** | `/campaigns` y `/insights?date_preset=last_30d` | **`{"data":[]}`** — la cuenta **no trae pauta hoy**. Lista vacía es una respuesta válida, no un error |
| Composio, otra vez | `GET /api/v3/toolkits/metaads` | **sigue sin auth administrada** (`composio_managed_auth_schemes: []`) — por eso va con app propia |
| El catálogo después del cambio | `CONNECTORS.filter(via==='composio')` | **21 toolkits** de Composio (eran 22) · **1** con `via: 'meta_own_app'` |
| **Pruebas de la corrida 11** | `npm run test:metaads` | **85 pasadas, 0 fallidas** — incluye las lecturas reales contra Graph |
| **Caso que DEBE fallar** | a mano: se le quitó a `calcularCpl` el guardia de "cero leads" | **1 fallida**, justo la que tocaba: *"esperaba null, llegó Infinity"*. Restaurado y verde otra vez |
| Pruebas de la corrida 5 | `npm run test:composio` | **74 pasadas, 0 fallidas** (contra la API real, con acción real de Airtable) |
| Pruebas de la corrida 3 | `npm run test:projects` | **70 pasadas, 0 fallidas** |
| Typecheck | `tsc --noEmit` | limpio |
| Build | `npm run build` | verde · las 4 rutas nuevas montadas |
| **UI** | WebKit **1440** y **390**, sesión real de Clerk | **8 capturas** · **8 con HTTP 200** · **0 errores de JS** · **0 notas internas** |
| … y lo que se cuenta, no se mira | sobre el DOM renderizado | la tarjeta "Meta Ads" **está** · **ya NO dice "Próximamente"** · avisa que es solo lectura · Campañas trae "Anuncios de Meta" con el **nombre real** de la cuenta y el **costo por lead** |

Las capturas viven en `capturas-c11/` del servidor. Lo que se versiona es
`capturas-c11/resumen.json`, que es la medición.

## Cómo quedó el flujo

1. **Conectar** — la tarjeta ofrece el botón cuando existen `META_APP_ID` y
   `META_APP_SECRET`. La ventana de permisos se abre **aparte** y la pantalla se
   queda donde está, con polling cada 3 s: el patrón de Composio de la corrida 5,
   por la misma razón (si Facebook manda a la persona a iniciar sesión, quien
   conecta no pierde su lugar).
2. **Permisos** — `ads_read`, `ads_management`, `business_management`,
   `pages_show_list`. Cuatro, ni uno más: pedir de más es como se cae una
   revisión de app de Meta.
3. **Elegir cuenta** — al volver, la conexión **todavía no está hecha**. Falta
   que la persona diga cuál de sus cuentas publicitarias es la de este proyecto,
   y la tarjeta **no se pinta de verde** mientras tanto. No se adivina: una
   agencia administra varias cuentas con el mismo usuario de Facebook, y elegir
   la primera de la lista sería reportarle a un cliente el gasto de otro.
4. **Guardar** — la cuenta se comprueba contra Meta **antes** de guardarla. Ese
   `GET` es el que sella `verified_at`, y `verified_at` es lo único que enciende
   el verde.
5. **Verificar** — cada vez que se abre Conexiones se vuelve a preguntar a Graph.
   Si contesta bien, el verde se renueva; si no, la tarjeta pasa a *Reconectar*
   con el motivo en español.

## Tres decisiones que vale la pena defender

### 1. El divisor del costo por lead son NUESTROS leads, no los de Meta

Meta cuenta lo que pasó en su plataforma. Goossip cuenta lo que **llegó al
pipeline del cliente**. Cuando los dos números no cuadran —formularios sin
suscribir, leads que Meta agrupa—, el que le importa a quien paga la pauta es el
segundo. Por eso `costoPorLead` divide el gasto entre los `sales_leads` con
`source = 'meta_leadgen'` del periodo.

Y **los dos números se enseñan**: la tarjeta dice *"2 leads entraron a Goossip ·
Meta reporta 0"*. La diferencia se ve, no se tapa.

De paso: los leads de Meta llegan con **dos nombres** en `actions` (`lead` y
`onsite_conversion.lead_grouped`) y no siempre vienen los dos. Sumarlos contaría
doble, así que se toma el mayor — y por eso eso es una función con nombre y una
prueba, no un `.find()` suelto en media app.

### 2. Sin leads, el costo por lead es un guion, no un cero ni un infinito

`calcularCpl` devuelve `null` cuando no hay leads. Un cero diría "te sale
gratis"; dividir entre cero diría "cuesta infinito". Las dos son mentiras. La
pantalla pone **`—`** y debajo explica de dónde saldría el número.

### 3. El permiso del cliente se borra cuando el cliente lo quita

`revokeConnection` apagaba el estado y quitaba el `external_id`, pero el token
cifrado se quedaba en `metadata`. Un permiso de 60 días guardado **después** de
que el cliente lo revocó no es una conexión: es un secreto que ya no tenemos por
qué tener. Ahora se borra (`olvidarTokenMetaAds`). La bitácora de quién conectó
y cuándo sí se queda — esa es la parte que sirve.

## Lo que se movió de sitio (y por qué)

- **`metaAppId()` / `metaAppSecret()` viven ahora en `lib/meta-graph.ts`.** De la
  misma app de Meta salen dos caminos: las **páginas** (`meta-oauth.ts`,
  corrida 3) y las **cuentas publicitarias** (`meta-ads.ts`, esta). La regla de
  "vacío o `[SENSITIVE]` es lo mismo que no estar" tiene que estar escrita una
  sola vez, y `meta-graph.ts` es el único de los tres sin `server-only`, o sea el
  único que los tres pueden importar.
- **El `state` del OAuth ahora dice de cuál de los dos caminos viene** (`via:
  'paginas' | 'ads'`). Los dos firman con el mismo secreto: sin eso, un `state`
  de uno valdría en el callback del otro, y el de Ads se pondría a buscar cuentas
  publicitarias con un permiso que solo trae páginas.

## El bloqueo, declarado

**La URL de retorno tiene que estar dada de alta en Facebook Login.** En la app
"V&Living MCP", en *Facebook Login → Settings → Valid OAuth Redirect URIs*, hay
que agregar:

```
https://<dominio-de-goossip>/api/connections/metaads/callback
```

Sin eso Facebook rechaza el `redirect_uri` y el permiso no se completa desde el
navegador. Es un botón de Luis, no de código.

Mientras tanto, **el camino se probó por partes y de verdad**, que es lo que el
propio issue autoriza:

- el **intercambio del código** se probó con un código inválido: revienta contra
  Meta de verdad y sale por el camino del error en español, no por una pantalla
  cruda ni por un 500;
- **todas las lecturas** —listar cuentas, verificar, campañas, insights, costo
  por lead— se probaron con el `META_USER_TOKEN` que ya vivía en el entorno,
  contra la cuenta real de V&LIVING;
- ese token **no se guardó en la app**: solo entró a la fila de un proyecto de
  prueba para sacar las capturas, cifrado, y el mismo guion lo borró al terminar
  (queda comprobado en el resumen: *"no quedó ningún permiso guardado de la
  prueba"*).

## Lo que NO entra en esta corrida

- **Crear campañas, pausarlas o mover presupuesto.** El adaptador es de lectura y
  la pantalla lo dice: *"Goossip solo lee esta cuenta. Para crear campañas o
  mover el presupuesto, entra a tu Administrador de anuncios de Meta."* Mover el
  gasto de un cliente desde una automatización es una decisión de Luis, no de un
  commit.
- **El adaptador de `metaads` por Composio** (`src/channels/pauta.ts`) no se
  borró. Se queda escrito para el día que Composio habilite auth administrada.
  Lo que funciona hoy es el otro.
- **El conector de páginas de Meta** (`META_OWN_APP`) sigue apagado y como
  estaba. Es otro conector y otra decisión.

## Una cosa que solo se vio MIRANDO las capturas

A **390**, el botón flotante del Asistente cae encima del botón "Refrescar" de la
sección de Anuncios de Meta. No se tocó: el flotante es del armazón de la app y
esta corrida corre en paralelo con la que está trabajando justo ahí. Queda
anotado para quien tenga ese archivo.

## Cierre y re-verificación (20-sep-2026)

La corrida se cortó el 16-sep por límite de sesión, pero **ya había cerrado lo
esencial**: PR **#48 quedó MERGEADO en `main`** el 16-sep 15:54 UTC. Desde
entonces `main` avanzó con las corridas 8 y 13 (Asistente de tres columnas +
adjuntos, publicación nativa por red). Al retomar el 20-sep se hizo
`git rebase origin/main` y se **volvió a medir sobre `main` ya integrado**, para
comprobar que la integración no rompió el conector:

| Qué se re-midió (20-sep, sobre `main`) | Resultado |
|---|---|
| `npm run test:metaads` | **85 pasadas, 0 fallidas** |
| `npm run test:projects` | **70 pasadas, 0 fallidas** |
| `npm run test:composio` | **74 pasadas, 0 fallidas** |
| `npm run test:campanas` | **93 pasadas, 0 fallidas** |
| `npm run build` | **verde** (exit 0) — hubo que `npm install` porque la corrida 8 sumó `xlsx` y el `node_modules` local del 16-sep no lo tenía; no es un fallo del conector |
| Deploy de producción de `main` (SHA `55843d2`) | **success (READY)** — `https://goossip-9y9p8ikbt-luis-projects-48b011f9.vercel.app` |
| `/sign-in` en producción | **HTTP 200** (goossip.vercel.app y la URL del deploy) — ≠ 500 |

Los siete archivos del conector (`lib/meta-ads.ts`, `src/channels/metaads.ts`,
las tres rutas de `/api/connections/metaads/*`, `/api/projects/[id]/metaads`,
`components/ads/meta-ads.tsx`) **siguen íntegros en `main`** tras el merge de
integración. El único pendiente sigue siendo el botón de Luis: dar de alta la
Redirect URI del callback en Facebook Login de la app "V&Living MCP".

---

**PR:** #48 (MERGED) · **Rama:** `feat/meta-ads-app-propia-c11` · **Issue:** #36
