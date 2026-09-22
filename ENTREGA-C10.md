# Entrega — Corrida 10: la Sala de arte y comunicación

Rama: `feat/sala-de-arte-c10` · sale de `main` con las corridas 1–13 ya dentro
(se rebaseó sobre `origin/main` antes de empezar).
Deploy preview: **READY** — https://goossip-efwxpje0e-luis-projects-48b011f9.vercel.app
`/sign-in`: **HTTP 200** con el bypass de protección (302 al SSO de Vercel sin
él, nunca 500). Título "Goossip — Tu agente social autónomo", con el formulario
de iniciar sesión.

Lo que pidió Luis el 16-sep: renombrar "Contenido" a **Sala de arte y
comunicación** y volverla un sitio donde se mira la pieza como la va a ver la
gente en cada red, se comprueba que la red la va a aceptar sin banear la cuenta,
y se decide. Más el chip de WhatsApp que ya no ofrece Conectar.

La ruta se queda en `/contenido`: hay enlaces vivos en el Inicio, en el
Asistente y en correos que ya salieron. Se renombró la sección, no la URL.

---

## 1. Visor fiel por red

Cada red se pinta con su UI de verdad, no una tarjeta genérica:

| Red | Lienzos | Chrome |
|---|---|---|
| Facebook | muro 1200×630, cuadrada 1080×1080, video, Messenger | avatar, nombre de página, contadores, burbuja |
| Instagram | feed 1:1 y 4:5, historia 9:16, reel 9:16 | barras de UI de IG, zonas seguras rayadas |
| LinkedIn | persona e imagen 1200×627, carrusel PDF | documento |
| X | texto + imagen 16:9 y 1:1, hilo | segunda burbuja del hilo |
| TikTok | 9:16 con zonas seguras + caption | botones laterales de TikTok |
| YouTube | miniatura 1280×720 + título + descripción | miniatura |

**19 lienzos** en total (probado). El recorte es de verdad (`object-cover` con la
proporción de la ficha), y el texto se corta donde la red lo corta, con "ver
más": FB ~63, IG 125, LinkedIn 210, X 280 duro, TikTok 2200 visibles, YouTube
título 100. Contador de caracteres, hashtags y menciones por red, con su límite.

Los números salen de `src/creative/specs.ts` y `src/creative/cortes.ts`, cada
uno con su URL oficial y la fecha en que se leyó — nada de memoria del modelo.

## 2. Calidad y botón Adaptar

`src/creative/calidad.ts` valida resolución mínima, peso máximo, formato,
duración de video, relación de aspecto y bitrate. Mide el **archivo real**, no lo
que dice la base: en las capturas la pieza sembrada (un hero apaisado) sale "No
se publica" en el muro 4:5 de Instagram porque el archivo de verdad no cabe —y
ofrece **Adaptar**, que recorta/re-codifica con sharp/ffmpeg. Eso es la prueba
de aceptación 1.

## 3. Manuales oficiales en la memoria de diseño

Ingeridos a `design_knowledge` con `category='reglas'` y `network`:
**35 políticas** (Facebook 9, Instagram 2, LinkedIn 5, X 3, TikTok 3, YouTube 4,
Google Ads 4, México 5) + **8 fichas de límites** por red. El `source_path` de
cada una **es** la URL oficial, así que preguntarle a la memoria devuelve la
regla y su procedencia pegada.

Las **38 páginas oficiales se descargaron con WebKit** el 16-sep a
`/root/goossip-c10-fuentes` (1.2 MB); cada `dice` del código es texto de esa
descarga. Tres cosas honestas que quedaron dichas en el código y valen leerse:

- Donde la red **no publica** su tope (LinkedIn), el número es `null` y se dice
  "no está publicado". No se inventa un 25 para que el contador se vea bonito.
- **Ninguna red publica su lista de hashtags bloqueados** (IG ni TikTok): se
  revisa lo que las políticas sí dicen y el resto lo juzga el modelo con las
  reglas delante.
- **Dos correcciones al spec**, porque la página oficial dice otra cosa:
  Instagram son **100/24 h** (50 en secuencias), no 25; y la **NOM-024** es de
  empaques y garantías, no de comercio electrónico — el comercio electrónico
  está en el **art. 76 BIS de la LFPC**. Se guardan las dos con lo que dicen.

`buscar_en_diseno("límite de posts por día en X")` devuelve la página de X con
su URL (prueba de aceptación 4, verde en el test).

## 4. Compuerta anti-baneo

`src/creative/compliance.ts` corre, antes de Aprobar o Publicar:

- **Reglas duras** (un `if`, sin modelo): largo por red, hashtags de más,
  menciones masivas (8, criterio de la casa y se dice), enlaces acortados,
  promesa de rendimiento financiero, texto ya publicado, calidad del archivo,
  frecuencia.
- **Revisión con el modelo** contra las reglas ingeridas de esa red. El modelo
  **suma, nunca resta**: no puede poner verde lo que las reglas duras pusieron
  rojo, y una cita a una regla que no existe se tira.

Resultado **Verde / Ámbar / Rojo**:
- Rojo: no sale, ni en autonomía 4, ni aunque quien apriete sea una persona. El
  botón Aprobar **no está** (ausente, no gris). Motivo y regla citada con URL.
- Ámbar: sale si una persona lo decide, con la advertencia y el botón **Corregir
  con Goossip** — que ahora **corrige de verdad**: reescribe el texto con el
  modelo para limpiar los hallazgos (quita la promesa, baja los hashtags, abre
  el enlace) sin cambiar el mensaje ni pasarse del tope, y vuelve a pasar la
  compuerta con el texto nuevo. Antes solo re-revisaba el mismo texto.
- Cada revisión queda en `project_events` (`compuerta_revisada`, `pieza_adaptada`).

Control de **frecuencia** por red y cuenta (`src/creative/frecuencia.ts`):
contador del día, espaciado mínimo (criterio de la casa, marcado como tal),
cuota de YouTube por unidades, y el aviso "te quedan N publicaciones hoy".

Prueba de aceptación 2, medida en la UI del preview: "te garantizamos 20 % de
rendimiento anual" → **Rojo**, citando la política de publicidad de Meta **y** el
art. 32 de la LFPC (PROFECO), sin botón Aprobar.

## 5. Guía "cómo se postea aquí"

Panel lateral por red (`src/creative/como-se-postea.ts` + `guia-red.tsx`): cómo
escribir, primeras líneas, CTA, hashtags con el tope oficial **y** el criterio de
la casa por separado, horarios del propio proyecto (no inventados), lo que
banea (las reglas que bloquean, con su URL), y los límites vivos del proyecto
(cuota usada hoy).

## 6. WhatsApp — decisión de Luis

El chip de WhatsApp en la franja de Conexiones del Inicio ya **no ofrece
Conectar**: sale "Más adelante" y no lleva a ningún lado. Lo manda la bandera
`WHATSAPP_ENABLED` (apagada por omisión), no un texto escrito a mano en la
pantalla. Probado en `test/projects.test.ts`.

---

## Evidencia medida

| Qué | Cómo | Resultado |
|---|---|---|
| Tipos | `tsc --noEmit` | **0 errores** |
| Build | `next build` | **Compiled successfully** |
| Tests c10 | `tsx test/corrida10.test.ts` | **132 pasadas · 0 fallidas** |
| No rompí lo de antes | corrida7 / projects / corrida13 | **178 / 72 / 30 · 0 fallidas** |
| Ingesta | `npm run ingest:diseno` | 43 pedazos en `reglas`, 28 en `spec-red` |
| Capturas Sala | WebKit **1440**, sesión Clerk real, 6 redes | **6/6 HTTP 200** · lienzo 6/6 · guía 6/6 · contador 6/6 · **0 errores JS · 0 jerga** |
| Compuerta en rojo | WebKit sobre el editor de la Sala | rojo ✓ · cita Meta ✓ · cita ley MX ✓ · sin botón Aprobar ✓ |
| Deploy | Vercel, push a la rama | **READY** |
| `/sign-in` | `curl` con bypass de protección | **HTTP 200** (302 al SSO sin bypass; nunca 500) |

Las capturas viven en `capturas-c10/` del servidor; se versiona
`capturas-c10/resumen.json`, que es la medición. **Miradas** a 1440: Facebook,
Instagram, TikTok y la compuerta en rojo. El visor pinta cada red con su UI, la
compuerta atrapa el aspecto del archivo real y ofrece Adaptar, la guía "cómo se
postea en X" está en las seis, sin jerga de desarrollo ni imágenes rotas.

## Lo que un revisor debe saber

- **Una falla heredada de `main`, fuera del alcance c10**: `test/creative.test.ts`
  trae 1 fallida ("sin la red conectada… ConMarca linkedin") que está **igual en
  `origin/main` limpio** (medido). Es de la tubería de publicación que
  reescribieron las corridas 11/13, no de la Sala. No la toqué para no invadir
  ese dominio; queda señalada aquí.
- La compuerta usa el modelo (OpenRouter). Sin la llave del proveedor, la
  revisión con modelo cae a **ámbar con aviso honesto** (no verde): no haber
  podido revisar no es estar limpio.
- Hay que correr `npm run ingest:diseno` al mergear si se quiere refrescar la
  memoria de diseño; es idempotente (corrida dos veces escribe cero).
- Otro agente trabaja la corrida 8 (layout 3 columnas + Asistente). **No toqué**
  `app-shell.tsx`, `components/assistant/*` ni el compose; conviven en las
  capturas (el panel del Asistente sale a la derecha de la Sala).
