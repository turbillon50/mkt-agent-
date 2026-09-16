# GOOSSIP CORRIDA 8 — GOOSSIP SIEMPRE ABIERTO: TRES COLUMNAS Y COMPOSE PODEROSO

```
GOOSSIP CORRIDA 8 — GOOSSIP SIEMPRE ABIERTO: TRES COLUMNAS Y COMPOSE PODEROSO
Layout: tres columnas de verdad — el contenido se REACOMODA, no se tapa. Medido: <main> pasa de 816 px con el panel abierto a 1128 px plegado (1440), y de 760 a 968 (1280)
Panel: 250–480 px arrastrando · plegado = tira de 48 px con badge · ancho y plegado guardados en localStorage Y en users.settings · sobrevive a recargar y a navegar (400 px seguían ahí en /conexiones)
Compose: adjuntos de cualquier tipo (arrastrar, pegar, clip) · @menciones con leads reales · /comandos (5) · dictado es-MX · autonomía Propone/Publica solo · historial por proyecto buscable por CONTENIDO
Lectura real: PDF 12 páginas leído y citado (Polanco · 24 niveles · marzo 2028 · $4,850,000) · DOCX · PPTX en orden de diapositiva · XLSX/CSV · imagen/video/audio por Gemini
Pruebas: corrida 8 94/0 · corrida 6 209/0 · corrida 5 72/0 (con acción real de Airtable) · corrida 4 93/0 · corrida 3 70/0 · corrida 2 61/0 · corrida 1 62/0 · aceptación en navegador 21/0
UI: WebKit 1440 y 1280 con sesión real de Clerk · 14 capturas + 3 de aceptación · 0 errores de JS · 0 notas internas · móvil 390 intacto
Deploy preview: READY — https://goossip-6bneiyrtj-luis-projects-48b011f9.vercel.app · /sign-in HTTP 200 con el bypass de protección (302 al SSO sin él, nunca 500)
Bloqueos de Luis: [BLOB_READ_WRITE_TOKEN no existe: los adjuntos suben por el almacén de la casa y el tope real hoy son 3 MB — sin ese token, video y PDFs grandes NO se pueden subir en producción | el Mesh contesta 502 "sin_motor" a TODA petición con stream:true (3 de 3) y 200 a las mismas sin transmitir: el texto llega completo, no token a token, hasta que la mesh sepa transmitir | correr `npm run db:migrate` contra producción al mergear (0019) | siguen los bloqueos viejos: CLERK_SECRET_KEY y NEXT_PUBLIC_CLERK_* fuera de Preview, HIGGSFIELD_ACCESS_TOKEN fuera de Vercel, Canva sin conectar en MOMENTUM]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| **Tres columnas de verdad** | ancho de `<main>` con el panel abierto y plegado, en WebKit | **1440: 816 px → 1128 px** · **1280: 760 px → 968 px**. Si el panel se montara encima, el número no cambiaría |
| El botón flotante en escritorio | `getBoundingClientRect` sobre el botón del cajón | **no existe** a 1440 ni a 1280 (`hayFlotante: false`) |
| Plegar | clic en "Plegar el panel" | **tira de 48 px** con el ícono y el badge de pendientes |
| Redimensionar | arrastre real del ratón sobre el tirador | 360 → **400 px** a 1440 |
| **Que el ancho sobreviva** (prueba 3 del spec) | navegar de /leads a /conexiones | **400 px** seguían puestos, y el panel **abierto** |
| El tope del panel a 1280 | el cálculo contra 760 px de contenido | **256 px**, y `<main>` se queda en **760 px** |
| Chips de contexto | texto renderizado del panel | "Estás en Leads" · "0 conectados" · "3 sin contactar" · "2 por atender" |
| Botones del compose | `aria-label` de cada uno | **9**: conversación nueva, historial, plegar, archivo, imagen, video/audio, @, /, mandar |
| **`@` trae leads reales** (prueba 4 del spec) | teclear "@an" en el compose | **2 leads del proyecto**: "Ana Gómez · nuevo · grado C · 5215511111111" y "Andrés Salas · …". Beatriz Luna no sale porque no dice "an" |
| `/` trae los comandos | teclear "/" | **5**: `/pieza` `/publica` `/leads` `/medidas` `/campaña` |
| **PDF de 12 páginas leído** (prueba 1 del spec) | soltarlo en el compose y preguntar | citó **Polanco**, **24 niveles**, **marzo 2028** y **$4,850,000** — los cuatro datos están solo dentro del PDF |
| … y propuso | la misma respuesta | **3 ideas de publicación** para Instagram, con gancho y qué mostrar |
| … cuánto tardó | del clic a la respuesta completa | **6–17 s** según la corrida |
| … y la lectura quedó guardada | `assistant_files` | `extract_status = leido` · **943 caracteres** · nota "12 páginas." |
| La foto adjunta | la misma fila | `leido` — la miró Gemini |
| Los dos adjuntos subieron | chips del compose + la base | **2 de 2**, ninguno falló, con su almacén anotado (`casa`) |
| El hilo | `assistant_conversations` | **1 hilo** del proyecto, con **título puesto solo** por el primer mensaje |
| Los turnos | `assistant_messages` | **2**, y el del usuario **recuerda sus 2 adjuntos** |
| Pruebas de la corrida 8 | `npm run test:asistente` | **94 pasadas, 0 fallidas** |
| **Dos casos que DEBEN fallar** | a mano: se le quitó el candado de proyecto a `getHilo` y se ordenaron las diapositivas por nombre | **4 fallidas**, justo las que tocaban. Restaurado y verde otra vez |
| Aceptación en navegador | `npx tsx scripts/aceptacion-c8.ts` | **21 pasadas, 0 fallidas** |
| Pruebas de la corrida 6 | `npm run test:creative` | **209 pasadas, 0 fallidas** |
| Pruebas de la corrida 5 | `npm run test:composio` | **72 pasadas, 0 fallidas** (3 bases de Airtable leídas, fila escrita y releída) |
| Pruebas de la corrida 4 | `npm run test:campanas` | **93 pasadas, 0 fallidas** |
| Pruebas de la corrida 3 | `npm run test:projects` | **70 pasadas, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` | **61 pasadas, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 7.2s` |
| UI | WebKit 1440 y 1280, sesión real de Clerk | **14 capturas** · **0 errores de JS** · **0 notas internas** |
| Móvil | la misma corrida a 390 | botón flotante **sí** · panel de escritorio **no** · el cajón **abre** |
| **Deploy preview** | `vercel deploy` | **READY** — https://goossip-6bneiyrtj-luis-projects-48b011f9.vercel.app |
| `/sign-in` en el preview | `vercel curl` con el bypass de protección | **HTTP 200**, con el título de Goossip y el formulario de iniciar sesión |

Las capturas viven en `capturas-c8/` del servidor. Lo que se versiona es
`capturas-c8/resumen.json` y `capturas-c8/aceptacion.json`, que son la medición.

---

## A. El layout: tres columnas, y la que se encoge es la de Goossip

**Un panel que se monta encima no es "estar siempre abierto", es interrumpir.**
Hasta la corrida 7 preguntarle algo a Goossip mientras mirabas tus leads te
tapaba los leads. Aquí el panel es hermano de `<main>` dentro del mismo `flex`,
así que el contenido se reacomoda. Es la diferencia que se mide arriba: 816 px
de contenido con el panel abierto, 1128 px plegado.

**El corte NO es 1280, es 1250, y no es un descuido.** El spec dice
"escritorio ≥ 1280". Una media query mide el viewport de MAQUETA, que no
incluye la barra de desplazamiento: en una ventana de exactamente 1280 px con
una página que scrollea —o sea, casi todas— el navegador reporta 1263. Con
`xl` (1280) el panel DESAPARECÍA justo en el ancho que el spec promete. Medido
el 16-sep en WebKit: a 1280, Conexiones se quedaba sin tercera columna al
navegar y Leads no, porque una scrollea y la otra no. 1250 = 1280 menos una
barra clásica con holgura.

**El panel tiene un tope que depende de la ventana.** La primera vuelta de
capturas a 1280 con el panel en 400 px dejó Conexiones con los títulos partidos:
"Meta A…", "Facebo…", y las descripciones bajando de una palabra por renglón.
Reacomodarse hasta volverse ilegible es lo mismo que taparlo. Ahora el tope se
calcula contra **760 px de contenido** —el ancho que tiene `<main>` en una
ventana de 1024 con el menú abierto, que es la medida para la que están hechas
todas las pantallas desde la corrida 3— así que a 1280 el panel se queda en
256 px. Y al achicar la ventana **cede el panel, no el contenido**, sin borrar
la preferencia: `--asistente-w-abierto` guarda lo que el usuario quiere y
`--asistente-w` lo que cabe hoy.

**El ancho y el plegado se guardan en DOS lados y hacen falta los dos.**
`localStorage` corre antes del primer pintado y es lo que evita el parpadeo;
`users.settings` es lo que hace que el panel esté como lo dejaste cuando entras
desde otra máquina. El script de arranque prefiere el del navegador y cae al del
servidor. Sin el primero, cada navegación pinta 360 px y salta; sin el segundo,
la preferencia no existe fuera de esa máquina.

**Plegar deja una TIRA, no cierra.** Cerrarlo del todo mataría la mitad de la
guía activa: el número de pendientes se ve sin abrir nada, y eso es lo que hace
que alguien abra.

**El celular no se tocó.** El cajón de siempre sigue abajo de 1250 px, con su
botón flotante. Los dos están montados a la vez y cuál se ve lo decide CSS, no
React: un `useMediaQuery` pinta primero uno y luego el otro, y ese salto se ve
en cada carga. Por eso mismo ⌘K pregunta de quién es antes de hacer nada — sin
eso, en escritorio abría un cajón invisible y se robaba el foco del compose.

## B. El compose, y la diferencia entre aceptar y LEER

Un chat que guarda el PDF y le dice al modelo «el usuario adjuntó
brochure.pdf» no leyó nada: el modelo contesta sobre el NOMBRE del archivo.
Aquí cada familia tiene su lector:

| Familia | Con qué | Nota |
|---|---|---|
| PDF | `pdf-parse` | si trae menos de 200 caracteres está escaneado y lo MIRA Gemini página por página |
| DOCX | `mammoth` | |
| PPTX | `fflate` + los nodos `<a:t>` | ordenado por NÚMERO de diapositiva: por nombre, la 10 va antes que la 2 |
| XLSX / XLS / CSV | SheetJS | tablas en texto, tope de 400 filas por pestaña **y se dice cuántas quedaron fuera** |
| TXT / MD / JSON | tal cual | |
| Imagen, video, audio | Gemini 2.5 | en línea hasta 14 MB; arriba, por la API de archivos |

**Se lee UNA vez.** El resultado se guarda en `assistant_files.extracted_text`.
Releer un PDF de 40 páginas en cada turno es pagar cinco veces el mismo trabajo
y tardar cinco veces más en contestar.

**Lo que no se puede leer se DICE, con la misma frase que ve el usuario.** Un
`.heic` de iPhone —el formato de fábrica, que ningún modelo lee todavía— no se
rechaza al subir: se guarda y el chip explica por qué y qué hacer. Y el modelo
recibe esa misma frase con la orden de repetirla: contestar sobre un archivo que
nadie pudo abrir, como si se hubiera abierto, es la forma más cara de mentir.

**Nada se trunca en silencio.** Cuando un documento pasa del tope se corta Y se
anota dónde. Medio PDF leído sin avisar contesta con media verdad.

**El `@` trae el DATO, no el nombre.** Mencionar "@Ana Gómez" y que Goossip
tenga que adivinar quién es Ana sería el mismo chat de antes con un adorno. Lo
que se menciona se vuelve a leer de la base **en el momento de contestar**, no
se confía en lo que mandó el navegador: entre que alguien escribió `@Ana` y le
dio enviar, Ana pudo cambiar de etapa. Y un id que no es de este proyecto
simplemente no aparece — hay prueba.

**Un `/comando` no es una ruta de código aparte.** Se expande a la frase que un
usuario escribiría, y esa frase la ve el modelo con sus herramientas de siempre.
Un `/publica` con su propio manejador sería una segunda forma de publicar, con
su propio candado de permisos que alguien olvidará revisar.

**El candado de autonomía no es el selector.** Un lector puede poner "Publica
solo" en su navegador todo lo que quiera: el modo se fuerza a "Propone" en el
servidor —y otra vez al armar las instrucciones— y además las tools de publicar
ni siquiera se le arman. El selector ni se le pinta. Hay prueba de las dos
cosas.

## C. Tres bugs que solo se ven corriendo la app de verdad

Las pruebas unitarias pasaban en verde mientras estos tres estaban vivos.

1. **El conteo de mensajes del historial era 0 SIEMPRE.** Drizzle interpola
   `${assistantConversations.id}` **sin el prefijo de tabla** cuando va en la
   proyección del `SELECT` (en el `WHERE` sí lo pone). Salía como `"id"` a
   secas, y `assistant_messages` también tiene una columna `id`: Postgres la
   resuelve al alcance más cercano, así que la condición se volvía
   `m.conversation_id = m.id`. La tabla va escrita completa. Lo cazó la prueba.

2. **`pdf-parse` no funcionaba DENTRO del servidor de Next.** El mismo PDF que
   la prueba lee bien con `tsx` volvía "escaneado" en producción, y cada PDF
   acababa en el lector de respaldo —Gemini mirando las páginas— que es más
   lento y cuesta. La causa: `pdf-parse` arrastra `pdfjs-dist`, que se carga a
   sí mismo por rutas relativas en tiempo de ejecución, y empaquetado por
   Turbopack truena. Está en `serverExternalPackages`. **Solo se vio corriendo
   el build de producción con un PDF real.**

3. **Una tabla de markdown se salía del panel.** Goossip contestó las tres ideas
   de publicación en tabla —que es lo correcto— y la tabla creció con su
   contenido hasta irse por debajo del borde de la ventana. Ahora la tabla es
   `display: block` con scroll propio: la que se mueve es la tabla, no el panel.
   De paso, los `<br>` que los modelos meten en las celdas se pintaban
   literales, como `<br>` en medio de la frase; se cambian por el salto que el
   modelo quería sin activar HTML, que sería dejar que el texto de un modelo
   meta etiquetas en la página.

## D. Lo que NO se pudo hacer, medido

**El texto no llega token a token, y no es el código.** El Mesh contesta
`502 {"error":"sin_motor"}` a **toda** petición con `stream: true` —tres de tres
medidas el 16-sep— y `200` a las mismas tres sin transmitir. Peor: Mastra se
traga ese error, cierra el stream vacío y el usuario se queda mirando una
burbuja en blanco. Eso era lo que pasaba en la primera corrida de aceptación:
21 pruebas y la respuesta era una línea de aviso.

Lo que hay ahora: el transporte SÍ es SSE y entrega por partes (el aviso de
lectura y el estado "Goossip está escribiendo…" llegan antes que la respuesta),
y cuando el stream no da nada **se vuelve a pedir sin transmitir**, que es lo
que funciona hoy. El día que el Mesh sepa transmitir, ese camino deja de usarse
solo, sin tocar nada. La condición mira también las tools: si el stream alcanzó
a ejecutar algo antes de morir, NO se reintenta — repetir un turno que ya
publicó publicaría dos veces.

**Los adjuntos grandes no se pueden subir en producción.** `BLOB_READ_WRITE_TOKEN`
no está en el entorno de Vercel del proyecto ni en `/root/.env` (buscado). Sin
él, los archivos suben por el almacén de la casa, y ahí el tope son **3 MB**: no
por el almacén, sino porque en Vercel el CUERPO de una petición a una función
tiene tope de 4.5 MB y el archivo viaja en base64. El código elige el almacén en
tiempo de ejecución, lo dice en la interfaz antes de que nadie arrastre nada, y
el camino de Blob —subida directa del navegador, que es lo único que puede con
un video de 200 MB— está escrito y se enciende solo en cuanto exista el token.

**No se extraen fotogramas con ffmpeg**, que es lo que decía el spec. En
funciones de Vercel no hay ffmpeg ni forma de instalarlo. Gemini 2.5 recibe el
video entero y lo muestrea él a 1 fps con su audio: es la misma idea, hecha
donde sí se puede hacer.

**El micrófono no aparece en WebKit.** `SpeechRecognition` existe en Chrome,
Edge y Safari, y no en Firefox ni en el WebKit de las capturas. Por eso el botón
de dictar no sale en las fotos: se calcula en un efecto, y pintarlo siempre
haría que en Firefox hubiera un micrófono que no hace nada.

## Decisiones que se apartan del spec, y por qué

- **El historial es de (proyecto, usuario), no del proyecto entero.** En una
  agencia, el hilo donde alguien le dictó a Goossip el tono de una campaña es
  SUYO; compartirlo con todo el equipo por omisión es publicar borradores que
  nadie publicó. Lo que sí es del proyecto —piezas, posts, conocimiento— ya vive
  en sus propias tablas y sus propias pantallas.

- **Los adjuntos NO se van con el hilo.** `assistant_files.conversation_id` es
  `ON DELETE SET NULL` y no `CASCADE`: el archivo vive en un almacén de afuera y
  borrar la fila no borra los bytes. Si la fila desapareciera con el hilo, el
  archivo quedaría en el almacén sin nadie que sepa que existe — basura que se
  paga para siempre. Hay prueba de que sobrevive.

- **`users.settings` es columna nueva y no se metió en `metadata`.** `metadata`
  es el espejo de lo que manda Clerk. El día que el webhook reescriba ese objeto
  entero —que es lo que hacen los espejos— el panel volvería a 360 px sin que
  nadie sepa por qué.

- **El historial se busca por CONTENIDO, no solo por título.** El título son las
  primeras palabras del primer mensaje, y lo que uno recuerda casi nunca es cómo
  empezó la conversación.

- **`assistant_conversations` en vez de seguir con `chat_messages`.** Esa tabla
  es por USUARIO y guarda el proyecto dentro del jsonb: pedirle "los hilos del
  proyecto X" es traer los últimos 20 del usuario y filtrarlos en memoria. Con
  dos clientes activos, el Asistente del segundo abría vacío.

## Lo que falta y depende de Luis

1. **`BLOB_READ_WRITE_TOKEN` en Vercel.** Sin él, hoy en producción no se puede
   subir un video ni un PDF de más de 3 MB — que es justo el caso de la prueba 2
   del spec. El código ya está escrito para los dos almacenes; es dar de alta un
   Blob store en el proyecto y meter el token.

2. **Que el Mesh sepa transmitir**, o apuntar el Asistente a un proveedor que
   sí. Hoy la respuesta llega completa en vez de escribiéndose. Es lo único del
   spec que no se pudo cumplir, y el motivo está medido arriba.

3. **Al mergear**, contra producción: `npm run db:migrate` (crea
   `assistant_conversations`, `assistant_messages`, `assistant_files` y
   `users.settings`).

4. Siguen abiertos los bloqueos viejos: `CLERK_SECRET_KEY` y las
   `NEXT_PUBLIC_CLERK_*` fuera del entorno Preview, `HIGGSFIELD_ACCESS_TOKEN`
   fuera de Vercel, Canva sin conectar en MOMENTUM, `CLERK_WEBHOOK_SECRET` sin
   dar de alta, WABA en Business Manager y Twilio fuera de Trial.

## Siguiente acción

Mergear, correr `npm run db:migrate`, y entrar a `vliving.life` en una pantalla
de escritorio: Goossip ya está ahí, a la derecha, abierto. Arrástrale el borde
hasta donde te acomode, suéltale el brochure del cliente y pídele la publicación
de la semana.
