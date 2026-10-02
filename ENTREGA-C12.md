# GOOSSIP CORRIDA 12 — PROSPECCIÓN "SHOWTIME": MÍRALO RECORRER EL MAPA

```
GOOSSIP CORRIDA 12 — PROSPECCIÓN SHOWTIME
Mapa vivo: la Sala recorre la zona por 9 cuadrantes en vivo (SSE real), negocios cayendo uno por uno, contador y narración
Búsqueda por objetivo: presets por tipo de proyecto (inmobiliario / marketplace) + giros libres + 6 filtros (sin sitio, WhatsApp, abiertos, rating, reseñas, horarios)
Enriquecimiento visible: "leyendo su sitio…" saca correo/WhatsApp/redes del sitio PÚBLICO del negocio (robots.txt respetado) — nunca personas
Costo y límites: búsquedas del mes / tope junto al botón, ANTES del clic; el barrido se corta a media zona si se acaba el presupuesto
Modo Presentación: pantalla completa, sin sidebar, más lento, narración al centro — para enseñárselo a un prospecto en vivo
Cierre en lote: "mándalos a la cola" (sin sitio) y "convertir a leads", hasta 50 por clic
Barrido real (Tulum): 86 negocios · 9 cuadrantes · 86 place_id únicos en la base · 10 búsquedas de 60 · 22.6 s
Recorrido en WebKit 1440: 144 negocios reales · 144 place_id únicos = nombres en pantalla · 6 capturas · 19 búsquedas cobradas
Deploy preview: READY — https://vmomentum-market-jc1nirr55-luis-projects-48b011f9.vercel.app · /sign-in 200 · PR #59
Necesita a Luis: la llave de Maps sirve para Places (servidor) pero NO para Maps JavaScript (navegador, InvalidKeyMapError) → el mapa cae a MapLibre+OSM; habilitar "Maps JavaScript API" en la llave para tener teselas de Google
Segundo encargo (Investigador Nativo, issue #40): declarado, NO entró en esta corrida — es un servicio Playwright aparte en el Hetzner
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| **Barrido real (prueba 1 del encargo)** | `npx tsx test/sonda-barrido.ts` contra Places API (New), proyecto real, DB real | **86 negocios** en Tulum · **9 cuadrantes** · **86 place_id únicos** en la base · 0 repetidos · 28 sin sitio web · **10 búsquedas** de 60 · **22.6 s** |
| **Recorrido en la app (prueba 2)** | `scripts/capturas-c12.ts` en **WebKit 1440**, sesión real de Clerk, se aprieta el botón como una persona → barrido REAL | **144 negocios** · 79 con sitio · 98 con teléfono · **144 place_id únicos** · **19 búsquedas cobradas** · **6 capturas** |
| … pantalla = base | nombres de las tarjetas contra `prospects` | **0 nombres en pantalla que no estén en la base** — cada marcador es un negocio guardado, no un adorno |
| … el lienzo pintó de verdad | `canvas.width/height` sobre el DOM | **2828 × 1660** (dScale 2) — no basta con que exista el `<canvas>`, se midió que dibujó |
| … el enriquecimiento se ve | `waitForFunction(/leyendo su sitio/)` | el paso "leyendo su sitio…" aparece en pantalla; sale correo/WhatsApp/redes del sitio público |
| Contador en vivo | texto del DOM durante el recorrido | `144 negocios · 98 con teléfono · 79 con sitio web` + `cuadrante N de 9` |
| Resumen final | caja "Lo que encontré" | `65 negocios sin sitio web` · `1 con rating menor a 3.5` · `46 sin teléfono publicado` + botones de cierre |
| Modo Presentación | captura 06 | pantalla completa, sin sidebar, narración al centro, contador grande |
| **Costo antes del clic** | línea junto al botón | `9 cuadrantes × N giros = hasta X búsquedas de tus 50 del mes` — se ve ANTES de gastar |
| **Pruebas del Asistente (corrida 8)** | `npx tsx test/asistente.test.ts` | **94 pasadas, 0 fallidas** (incluye la tool `recorrer-zona-en-vivo`) |
| Pruebas de proyectos | `npx tsx test/projects.test.ts` | **70 pasadas, 0 fallidas** |
| Pruebas de la corrida 13 (main) | `npx tsx test/corrida13.test.ts` | **30 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | READY, `/projects/[id]/prospeccion` compilada |
| Deploy | `vercel deploy` | **READY** · `/sign-in` **200** (302 → SSO de Vercel sin bypass; 200 con la app real detrás, título "Goossip — Tu agente social autónomo") |
| Errores de JS en el recorrido | `pageerror` en WebKit | **1**: el `InvalidKeyMapError` esperado de la llave de Maps — ya manejado por el fallback (ver abajo) |

Las capturas viven en `capturas-c12/` del servidor. Lo que se versiona es
`capturas-c12/resumen.json`, que es la medición.

---

## Qué se construyó (encima de la corrida 7, sin rehacerla)

La corrida 7 dejó la búsqueda de una frase (`buscarNegocios`) y el tablero de
la lista. Esta corrida agrega **el recorrido**, que es otra pregunta: la 7
contesta *¿a quién encontré?*, la 12 contesta *¿de dónde salió eso?* — la que
cierra ventas cuando el prospecto tiene la pantalla enfrente.

- **`src/prospeccion/geo.ts`** — la geometría: parte el radio en una cuadrícula de 3×3 (o espiral), da la caja y el círculo de cada celda, y el zoom para un radio. Lo comparten el mapa del navegador y el barrido del servidor.
- **`src/prospeccion/objetivos.ts`** — los presets por tipo de proyecto (inmobiliario: desarrolladoras, notarías, arquitectos…; marketplace: restaurantes, gimnasios, spas…), los 6 filtros y cómo se aplican.
- **`src/prospeccion/narracion.ts`** — la voz de Goossip: "Revisando el centro de Tulum… 12 restaurantes, 4 sin sitio web: oportunidad". Es lo que se lee en el panel del modo Demo.
- **`src/prospeccion/barrido.ts`** — el motor: un **generador asíncrono** que va escupiendo eventos (`inicio`, `cuadrante`, `negocio`, `leyendo`, `leido`, `resumen`…). La ruta los manda por SSE, la sonda los cuenta — los dos ven la misma secuencia, que es la única forma de que lo que se prueba sea lo que se ve. Cuenta el gasto ANTES de cada llamada, corta si se acaba el presupuesto, respeta el `AbortSignal` si el usuario cierra la pestaña, y anota lo gastado pase lo que pase.
- **`src/prospeccion/maps.ts`** (ampliado) — `pedirLugares` con paginación real (Places `searchText` por rectángulo / Composio `NEARBY_SEARCH` por círculo), `enriquecerDesdeSitio` que lee el sitio público del negocio respetando `robots.txt`, y el tope mensual de búsquedas.
- **`app/api/projects/[id]/prospeccion/barrido/route.ts`** — el canal SSE (POST + `text/event-stream`, `no-transform` y `X-Accel-Buffering: no` para que un proxy no congele el recorrido).
- **`components/prospeccion/mapa-motor.ts`** — el mapa detrás de una sola puerta: Google Maps JS si la llave sirve, MapLibre + OpenStreetMap si no. La Sala no sabe cuál está abajo.
- **`components/prospeccion/sala.tsx`** — la pantalla: mapa de lado a lado, lista que cae, contador, narración, modo Presentación, resumen y cierre en lote.
- **`app/(dashboard)/projects/[id]/prospeccion/page.tsx`** — la ruta propia (se puede mandar el enlace antes de una junta) que también es el puente con el Asistente.
- **`src/agent/project-tools.ts`** — la tool `recorrer-zona-en-vivo`: "busca restaurantes sin sitio web en Tulum" abre la Sala y la corre.

---

## El bug que solo se vio corriendo la app: la llave de Maps

`npx tsc` y `npm run build` pasaban, pero al abrir el recorrido en WebKit el
mapa se quedaba **gris** y las capturas fallaban con `canvas timeout`.

**Causa raíz.** La llave del proyecto está habilitada para **Places API** —la
que paga las búsquedas del servidor, verificada con un `searchText` real que
contestó 200 con negocios de Tulum— pero **NO para Maps JavaScript** en el
navegador: Google contesta `InvalidKeyMapError`. Y el detalle que lo volvía
silencioso: Google **no lanza una excepción** cuando eso pasa; dispara
`window.gm_authFailure` y deja el lienzo gris. `crearMotor` devolvía un mapa
muerto como si funcionara, sin caer al respaldo.

**El arreglo (commit del fix).** El motor ahora escucha `gm_authFailure`,
confirma la primera tanda de teselas antes de darse por bueno, y si la auth
falló **truena para que `crearMotor` use MapLibre + OpenStreetMap**. El
recorrido animado y los datos reales funcionan igual con cualquiera de los dos;
el badge "mapa: OpenStreetMap" lo declara sin esconderlo. (De paso: un backtick
dentro de un comentario CSS cerraba el template literal de la Sala y rompía el
build — `sala.tsx`.)

**Lo que necesita a Luis.** Para tener las teselas de Google en el mapa vivo
(no solo los datos), hay que **habilitar "Maps JavaScript API" en esa llave** en
Google Cloud Console y agregar el dominio a la allowlist de referrers. En cuanto
esté, el código la toma sola: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ya está inyectada
en Vercel y `crearMotor` prefiere Google cuando la llave responde. Ideal a
futuro: **dos llaves** — la de Places restringida por IP (server), la de Maps JS
restringida por dominio (browser) — para no publicar la que cobra.

---

## Rebase sobre `main`

La rama se rescató de un corte de sesión (16-sep) y `main` avanzó 11 commits
(corrida 13: bandeja social, pauta de Google, identidades). Se rebasó sobre
`origin/main` y se resolvieron 3 conflictos a mano: `src/projects/types.ts`
(se conservaron los eventos de ambas corridas: `conversacion_respondida`,
`campana_google_cambiada` **y** `prospeccion_barrido`), `package.json` (mammoth
**y** maplibre-gl) y `package-lock.json` (regenerado desde el de `main` +
`npm install`). Después del rebase: `tsc` limpio, build OK, tests de main verdes.

---

## Bloqueos y pendientes de Luis

1. **Llave de Maps JavaScript** — habilitar "Maps JavaScript API" en la llave (+ allowlist de dominio) para ver las teselas de Google; hoy el mapa vivo usa MapLibre + OpenStreetMap por el `InvalidKeyMapError`. Los datos (Places) ya funcionan.
2. **Investigador Nativo de Competencia** (issue #40, segundo encargo aprobado el 16-sep) — **no entró en esta corrida**. Es un servicio Playwright aparte en el Hetzner (systemd, token interno, Chromium ya instalado) que navega fuentes públicas y sintetiza con fuentes citadas. Como pidió el encargo, se entregó primero la Prospección completa y el Investigador queda declarado y pendiente para la siguiente corrida.
3. Siguen los bloqueos viejos de la corrida 7 que dependen del entorno de Vercel (Clerk en Preview, etc., ver ENTREGA-C7).

---

## Deploy y PR

- Preview **READY**: https://vmomentum-market-jc1nirr55-luis-projects-48b011f9.vercel.app
- `/sign-in`: **200** (la app real; 302 → SSO de Vercel cuando no se pasa el bypass de automatización).
- PR: **#59** hacia `main`.
- Al mergear no hace falta migración nueva: el esquema de `prospects` / `prospect_searches` (con `enrichment`, `kind`, `nuevos`, `cost_units`, `via`) ya entró con la migración 0019 de la corrida 7.
