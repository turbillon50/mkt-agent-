# GOOSSIP CORRIDA 7 — HERRAMIENTAS, PROSPECCIÓN MAPS, VISOR Y AUTONOMÍA

```
GOOSSIP CORRIDA 7 — HERRAMIENTAS, PROSPECCIÓN MAPS, VISOR Y AUTONOMÍA
Competencia y Marca dentro del proyecto: OK · auditoría de marca midiendo píxeles (ΔE en CIELAB)
Prospección Maps: negocios 20 · convertidos 3 (+1 a la cola) · costo 1 búsqueda de 50 del mes
Visor por red: formatos 9 (6 redes) · aprobación: OK (7 estados, transiciones validadas en el servidor) · publicado real: pendiente de Luis, ver Bloqueos
Autonomía: niveles 4 · compuertas duras 4 (ningún nivel las abre) · lecciones guardadas: solo con corrección humana
Deploy preview: READY — https://goossip-6191yu2kl-luis-projects-48b011f9.vercel.app · PR: #42
Bloqueos de Luis: [GOOGLE_MAPS_API_KEY tiene que entrar al entorno de Vercel o Prospección queda apagada en producción | Meta no deja leer la página de un rival sin "Page Public Content Access": es revisión de app del lado de Composio, no nuestra | correr `npm run db:migrate` al mergear (0019) | siguen los bloqueos viejos: CLERK_SECRET_KEY y NEXT_PUBLIC_CLERK_* fuera del entorno Preview, HIGGSFIELD_ACCESS_TOKEN, Canva en MOMENTUM, WABA en Business Manager]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| **Corrección 1 — el checklist mentía** | `metaConectado()` sobre las tarjetas reales de MOMENTUM | antes: `meta=falta` con **6 cuentas vivas**; ahora **`meta=OK`** · el checklist pasa de 1/5 a **2/5** |
| **Corrección 2 — WhatsApp** | WebKit sobre `/projects/<id>/leads` | la caja "Plantilla de WhatsApp a un segmento" **no se monta**; la ruta contesta **409**; la tool **no está** en el menú del modelo (probado) |
| **Corrección 3 — reconciliar** | `reconciliarConComposio()` en MOMENTUM y GOOSSIP | MOMENTUM: **6 cuentas** en Composio, 6 encendidas · GOOSSIP: **encontró LinkedIn activo que la app no enseñaba** |
| Franja de conexiones | contado sobre el DOM renderizado a 1440 | **25 chips** · 21 con "Conectar" · 4 "Próximamente" · "0 de 25 · Ver todas" |
| Asistente en el Inicio | contado sobre el DOM | **embebido** · **3 de 3** sugerencias de arranque |
| Herramientas del Inicio | contado sobre el DOM | **8 de 8**, cada una con su estado contado |
| Menú | contado sobre el DOM | **0** secciones globales de más · Competencia **dentro** del proyecto |
| **Prospección (prueba 1 del issue)** | `buscarNegocios("restaurantes en Tulum")` contra Places API (New) | **20 negocios** · **20 con teléfono** · **16 con sitio** · 0 repetidos |
| … convertidos | `convertirALead` y `proponerContacto` | **3 leads** con `source='maps'` + **1** en la cola como `propose_outreach` *pending* |
| … costo | `busquedasDelMes()` | **1 de 50** búsquedas del mes, registrada en `prospect_searches` |
| … enriquecimiento | los 8 primeros con sitio | **2 con correo**, 1 con WhatsApp, 3 con redes · Instagram bloqueó por robots.txt y **se anotó** |
| **Competencia (prueba 2)** | `leerFacebookPropio` / `leerInstagramPropio` de MOMENTUM | **25 posts** leídos por red, fuente `composio` · **3.84 por semana** en las dos · formatos contados |
| … los rivales | 2 rivales dados de alta, 7 lecturas | Meta **se niega** (`100/33`, texto del proveedor guardado) · la web de Lamudi **contestó 200** · inmuebles24 **403** de Cloudflare |
| … el veredicto | `veredictos()` | *"En Instagram publicas 3.84 por semana. De tus rivales no se pudo leer el ritmo: Meta no deja leer la página de otro sin revisión de app"* — **no se inventa la mitad que falta** |
| **Auditoría de marca** | 12 piezas de MOMENTUM bajadas y medidas con sharp | **12 de 12** bajadas · **45.3 %** de consistencia de paleta |
| … la aritmética del color | ΔE en CIELAB, a mano | dos azules parecidos: **9.2** · azul contra naranja: **144.7** |
| **Visor (prueba 3)** | contado sobre el DOM con el visor abierto | **9 formatos** de **6 redes** · contador de caracteres · zona segura dibujada · **cita la fuente oficial con fecha** |
| Aprobación | `moverPieza()` en la suite | 7 estados · **transiciones validadas en el servidor** · pedir cambios sin comentario **truena** · programar sin fecha **truena** |
| **Autonomía (prueba 4)** | `puedeSolo()` / `autoPublicaEn()` | nivel 2 + red en `auto_publish` → publica · nivel 1 con la red en la lista → **no** · las 4 compuertas duras **cerradas también en nivel 4** |
| Lecciones | `guardarLeccion` desde la ruta de piezas | se guardan **solo** con rechazo o cambios pedidos · entran al system del Asistente por parecido |
| **Pruebas de la corrida 7** | `npm run test:corrida7` | **148 pasadas, 0 fallidas** |
| **Caso que DEBE fallar** | a mano: se le quitó `mover_presupuesto` a las compuertas duras | **4 fallidas**, justo las que tocaban. Restaurado y verde otra vez |
| Pruebas de la corrida 6 | `npm run test:creative` | **209 pasadas, 0 fallidas** |
| Pruebas de la corrida 5 | `npm run test:composio` | **72 pasadas, 0 fallidas** (con acción real: 3 bases de Airtable leídas) |
| Pruebas de la corrida 4 | `npm run test:campanas` | **93 pasadas, 0 fallidas** |
| Pruebas de la corrida 3 | `npm run test:projects` | **70 pasadas, 0 fallidas** |
| Pruebas de la corrida 2 | `npm run test:orgs` | **61 pasadas, 0 fallidas** |
| Pruebas de la corrida 1 | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | `✓ Compiled successfully in 6.3s` |
| UI | WebKit **1440, 1280 y 390**, con sesión real de Clerk | **25 capturas** · **25 con HTTP 200** · **0 errores de JS** · **0 notas internas** |
| El Asistente con ⌘K | sobre la pantalla de Leads | abre · 3 sugerencias con botón · la pantalla de atrás sigue ahí · cierra con Escape |

Las capturas viven en `capturas-c7/` del servidor. Lo que se versiona es
`capturas-c7/resumen.json`, que es la medición.

---

## Las tres correcciones que dictó Luis

### 1. El Inicio decía que no había Facebook con seis cuentas conectadas

El bug no era de pintura. La lista de arranque preguntaba por el conector
**`meta`** —el de la app propia de Facebook— y ese conector está **apagado
desde la corrida 5**: con `META_OWN_APP=false` ni siquiera entra al catálogo,
así que `cards.find(c => c.id === 'meta')` devolvía `undefined` y el paso salía
en rojo. Mientras tanto, Facebook e Instagram de Composio estaban conectados,
verificados hacía diez minutos y publicando.

Ahora hay **una sola función**, `metaConectado(cards)`, y todo lo que pregunta
por Meta pregunta lo mismo. Mira las tarjetas de `facebook`, `instagram` y
—si alguien enciende la bandera— `meta`. Medido: el checklist de MOMENTUM pasó
de `meta=falta` a `meta=OK`.

Y una que salió de la misma revisión: una cuenta con la verificación de hace 48
horas **no cuenta**. Verde es una promesa, y esa no tiene con qué respaldarse.

### 2. WhatsApp se apaga en tres lugares, no en uno

La caja de Leads no se monta, **la ruta que encola contesta 409** y la
herramienta **desaparece del menú del modelo**. Esconder el botón y dejar la
ruta viva no es apagar nada: es esconder el interruptor. Cualquiera con la URL
podía dejar 200 acciones en la cola de un canal que no existe.

La bandera se lee por función y nunca con un `=== 'true'` suelto, por una razón
medida: `.env.local` de este proyecto trae hoy `WHATSAPP_ENABLED="[SENSITIVE]"`
—Vercel devuelve ese literal para las variables sensibles— y basta con que uno
de cinco archivos la compare al revés para que la función apagada se encienda
sola en producción.

### 3. Reconciliar es preguntar al revés

`verifyProjectAccounts` recorría **las filas que ya teníamos**: si la conexión
existía en Composio y aquí no había fila —o la fila quedó `disconnected` porque
el usuario volvió del permiso en otro navegador y el callback nunca corrió—,
verificar no la encontraba y la pantalla decía "sin conectar" de algo
perfectamente conectado.

`reconciliarConComposio()` pregunta al revés: **lista las cuentas del proyecto
en Composio y la base se acomoda a eso.** Composio es el dueño de la verdad;
nuestra tabla es una copia, y una copia que discute con el original no sirve.

Es **una** llamada (`user_ids=project:<uuid>`, sin filtro de toolkit), así que
se puede hacer en cada apertura de pantalla. Y encontró una de verdad: **GOOSSIP
tenía un LinkedIn ACTIVO en Composio que la app no enseñaba.**

---

## El Inicio: de lista de pendientes a centro de mando

Luis lo dijo con todas sus letras: *"en un nuevo proyecto no se ve todo lo que
tenemos de conexiones y demás; el chat y todas las herramientas deben ser
visibles y funcionar"*.

Lo que había eran cinco pendientes y seis ceros. **Un panel que solo enseña lo
que FALTA esconde lo que la app sabe hacer**, y quien entra el primer día se va
creyendo que compró un tablero vacío.

El orden de arriba abajo es el orden en que alguien decide qué hacer: dónde
estoy y qué puedo lanzar ahora · con qué cuento · a quién le pregunto · cómo voy
· con qué herramientas · qué pasó.

**Nada se esconde por no estar conectado.** Los 25 conectores están ahí: los
verdes porque ya están, los de acento porque se conectan hoy con un clic, y los
apagados porque todavía no —y esos también se ven, porque saber que TikTok viene
es parte de saber qué compraste.

**Prospección, Competencia y Calendario salieron del menú global.** No es
limpieza: es el mismo bug que tenía el chat global, una herramienta sin dueño.
La competencia de V&LIVING no es la de MOMENTUM y un calendario que mezcla tres
clientes no sirve para planear el de ninguno. Las rutas viejas quedan como
desvío: hay marcadores apuntando ahí.

---

## Prospección: por qué NO es PhantomBuster

Luis lo pidió "tipo PhantomBuster". Lo que **no** es tipo PhantomBuster, y es la
regla de la casa: **aquí no se raspa a ninguna persona.** PhantomBuster vive de
recorrer perfiles de LinkedIn con una sesión prestada, y eso termina en cuentas
baneadas y en cartas de abogados.

Lo que sí se hace son dos cosas, las dos públicas por voluntad del negocio:

1. Se le pregunta a **Google Maps por su API oficial** qué negocios hay de tal
   giro en tal zona. Google devuelve nombre, dirección, teléfono, sitio y
   rating porque el negocio los publicó para que la gente los use.
2. Se lee el **sitio del negocio** —su home y su página de contacto— para sacar
   el correo, el WhatsApp y las redes que **ellos mismos** pusieron ahí. Sin
   login y **respetando su robots.txt** (medido: Instagram lo prohíbe y se
   anota, no se le da la vuelta).

**Dos caminos al mismo Google, los dos oficiales.** El preferido es la cuenta
del CLIENTE por Composio (`google_maps`, auth administrada `OAUTH2`, 20 tools,
medido el 16-sep contra `GET /toolkits/google_maps`), porque el consumo cae en
la cuenta de quien es el negocio. El respaldo es la llave de Places de la casa,
para que la herramienta sirva el **primer día**, antes de que el cliente conecte
nada. Cuál se usó se guarda en cada búsqueda: el costo cae en bolsillos
distintos.

### Dos bugs que solo aparecen contra sitios reales

Los dos se encontraron corriendo la búsqueda de verdad sobre restaurantes de
Tulum, no leyendo el código:

1. **`wght@400..600` no es un correo.** El barrido a texto pelón devolvió una
   regla de CSS de variación de fuente como dato de contacto. Se quitan
   `<style>`, comentarios, `<link>` y las URL de Google Fonts antes de buscar
   nada. Y `facebook.com/2008` —el año de un aviso de copyright dentro de un
   enlace— tampoco es una página: un id numérico de página tiene 15 dígitos.
2. **Los `<script>` NO se tiran, y eso es al revés de lo que suena bien.** La
   primera versión los quitaba; medido contra sitios reales, los de Wix y
   Squarespace guardan su contenido —y sus datos de contacto— dentro de un blob
   JSON en un `<script>`. Con ellos fuera,
   `restaurantedeliciademitierra.com` daba **0 correos**; con ellos dentro, da
   su `mailto:` de verdad.

Y uno más, del mismo tipo: **el corte a 400 KB.** La home de ese restaurante
pesa **1.08 MB** y su `mailto:` está en el byte **568 150**. La página
contestaba 200, el correo existía, y el enriquecimiento devolvía "sin correo" —
el peor tipo de fallo, porque se ve igual que un negocio que no publica el suyo.

**Cuál de los correos es el del negocio** se decide por su DOMINIO. En la home
de un restaurante salieron cinco y tres eran de los desarrolladores de un
widget de terceros; el único que era del negocio compartía dominio con su sitio.

---

## Competencia: lo que Meta deja y lo que no

Medido el 16-sep-2026, y cambia el diseño entero:

- **Leer TU propia página funciona.** `FACEBOOK_GET_PAGE_POSTS` falla con
  `190 / 2069032` ("en la nueva experiencia para páginas se necesita un token de
  acceso a la página"), así que se va por el proxy con el token de página que
  devuelve `FACEBOOK_GET_USER_PAGES` — la misma conexión del proyecto.
  `INSTAGRAM_GET_USER_MEDIA` sí funciona directo.
- **Leer la página de OTRO, Meta no lo permite** sin "Page Public Content
  Access", que es una revisión de app del lado de Composio y no nuestra:
  `GET /inmuebles24` contesta `100 / 33` *"does not exist, cannot be loaded due
  to missing permissions"*. `business_discovery` tampoco existe en esta conexión
  de Instagram (`IGApiException 100`).

Así que el rival se lee por su web pública **y se dice, con el mensaje del
proveedor, cuándo Meta se negó**. Inventarle una frecuencia al rival para que la
pantalla se vea llena sería exactamente el dato que hace que nadie vuelva a
creerle a un panel.

**HTTP 200 no es lo mismo que "se leyó".** Instagram y Facebook contestan 200
con un muro de sesión: la página existe, el HTML pesa medio mega y adentro no
viene ni el nombre de la cuenta. La primera versión marcaba eso como lectura
exitosa con 0 posts; ahora se dice que hubo muro.

De paso salió un bug de la corrida 5: **el proxy se tragaba el motivo del
proveedor.** `dentro.error.message` no se leía, así que la pantalla decía "La
llamada al proveedor falló" en vez del texto de Meta que explica exactamente qué
falta y qué NO está roto.

### El ritmo: se cuentan los intervalos, no los posts

Lo encontró una prueba. Entre el primero y el último de N publicaciones hay
**N−1** huecos, no N. Con 25 posts la diferencia es del 4 % y da igual; con
**dos** posts publicados con una semana de diferencia, `N/días` contesta "2 por
semana" cuando la verdad es 1. Y dos posts es justo lo que se logra leer de una
cuenta chica, que es donde el número se iba a usar para decidir.

---

## El visor y la aprobación

**El recorte es real.** Cada marco tiene la proporción exacta de la spec oficial
y la imagen entra con `object-cover`, que es lo que hace la red: si la pieza es
4:5 y el marco es 9:16, ahí se ve lo que se va a perder. Un visor que estira la
imagen para que quepa enseña una mentira bonita.

**El texto se corta donde lo corta la red** y lo que queda detrás del "ver más"
se pinta apagado, no se esconde: el cliente tiene que ver qué mitad de su
mensaje nadie va a leer.

**La zona segura se DIBUJA.** Decir "269 px arriba" no le dice nada a nadie; ver
el titular debajo de la raya, sí.

Ni un número de píxeles está escrito en el componente: los 9 formatos vienen de
`specs.ts`, que los trae con su URL oficial y su fecha de lectura.

El camino es `borrador → en revisión → aprobada → programada → publicada`, con
`cambios` y `descartada` colgando. **Las transiciones se validan en el
servidor**, no en la pantalla: un botón mal pintado no puede mandar una pieza
publicada de vuelta a borrador. Y **pedir cambios obliga a escribir cuáles** —
sin el porqué no es una corrección, es un no, y ese texto es justo lo que se
guarda como lección.

---

## La autonomía tiene techo

Cuatro niveles: propone · publica contenido · contesta · opera campañas. Subir
se **sugiere** cuando lleva 10 acciones seguidas sin corrección; **el botón lo
aprieta el dueño**. Un sistema que se da permisos a sí mismo por buen
comportamiento es exactamente lo que nadie quiere firmar.

Y **cuatro compuertas que ningún nivel abre**: dinero, promesas legales, precios
que no vienen del catálogo y WhatsApp. Si el nivel 4 las abriera, no serían
compuertas — y eso es literalmente lo que prueba la suite.

**El cron pasa por esa compuerta.** Hasta esta corrida, `runOnce()` generaba un
texto y lo PUBLICABA en cada canal vivo de cada proyecto activo: comportamiento
de nivel 2 pasando en proyectos de nivel 1, es decir, publicar en la cuenta de
un cliente que nunca aprobó ni el texto ni la decisión de publicar solo. Ahora
hacen falta las dos cosas: nivel 2 o más **y** la red en `rules.auto_publish`.

Lo programado es aparte y **no necesita ningún nivel**: el permiso ya se dio,
con nombre y hora, cuando una persona le puso fecha.

---

## Dos cosas que solo se vieron MIRANDO las capturas

1. **El visor dentro de una tarjeta de la galería era ilegible.** La galería es
   un grid de tres columnas, así que la tarjeta mide un tercio de pantalla, y la
   columna de avisos del visor quedaba de treinta píxeles: el texto salía a
   **una letra por renglón**. Las clases `lg:` responden al ancho de la VENTANA,
   no al del contenedor, así que a 1440 creían tener sitio de sobra. El visor se
   abre ahora a ancho completo arriba de la galería — que además es donde se
   quiere ver: aprobar una pieza mirándola en miniatura es igual que aprobarla
   sin mirarla.
2. **El Asistente embebido tenía 620 px de blanco adentro.** La columna se
   estiraba a la altura de la de al lado. Se veía exactamente como lo que era:
   una caja sin terminar. Y el botón flotante del cajón caía encima del grid de
   Herramientas — en el Inicio sobra, porque el Asistente ya está ahí.

---

## Decisiones que se apartan del issue, y por qué

- **El issue dice que la prospección sale por Composio `google_maps`. Sale por
  ahí Y por Places.** Ejecutar `GOOGLE_MAPS_TEXT_SEARCH` sin cuenta conectada
  contesta `404 ActionExecute_ConnectedAccountNotFound` (medido), y conectar
  google_maps es un OAuth que solo puede completar el cliente. Un módulo de
  prospección que no sirve hasta que el cliente autorice una cuenta de Google
  está apagado para el 100 % de los clientes nuevos. Las dos vías son Google
  oficial; lo que cambia es a quién le cobra.

- **El mapa no usa librería de mapas.** Es un plano de coordenadas normalizadas.
  Lo que se contesta mirándolo —"¿están todos pegados o desperdigados?, ¿cuál
  está fuera de la zona?"— se contesta con la posición relativa. Leaflet o el
  SDK de Google serían 200 KB de JavaScript y una segunda llave de API para
  dibujar veinte puntitos; el enlace a Google Maps de cada negocio ya está.

- **Apollo y Hunter quedan fuera, ni siquiera detrás de bandera.** El issue los
  permite con llave del cliente. Medido: ninguno de los dos tiene auth
  administrada en Composio (`composio_managed_auth_schemes: []`), así que
  pedirían una llave que el cliente no tiene y que Goossip tendría que guardar.
  Con la vía oficial de Maps dando 20 de 20 negocios con teléfono, no hacen
  falta para cerrar la prueba.

- **`propuesta` no se renombró a `borrador`.** La columna es texto libre y
  renombrarla habría que migrar las 12 piezas que ya viven en producción. Lo que
  el usuario LEE es "Borrador", que es lo que significa.

- **Las lecciones se redactan con plantilla, no con un LLM.** Pedirle a un
  modelo que resuma la corrección mete una llamada más, latencia y —lo que
  importa— una interpretación entre lo que la persona dijo y lo que queda
  escrito. Lo que queda escrito son SUS palabras.

- **La mediana y no el promedio** para el tiempo de primera respuesta. Un lead
  que se quedó sin contestar tres días mueve el promedio del proyecto entero y
  esconde que los otros cuarenta se contestaron en dos minutos.

- **El ahorro de horas enseña su cuenta en la propia pantalla.** Un "te ahorré
  40 horas" sin la aritmética al lado es marketing, y lo que Luis va a enseñar
  en una junta tiene que aguantar la pregunta "¿de dónde sacaste eso?".

---

## Lo que falta y depende de Luis

1. **`GOOGLE_MAPS_API_KEY` tiene que entrar al entorno de Vercel.** Está en
   `/root/.env`, probada (HTTP 200, 20 lugares) y puesta en el `.env.local` del
   servidor, pero **la app en producción no la tiene**. Sin ella y sin que el
   cliente conecte su Google Maps, Prospección se enseña y dice que no hay por
   dónde buscar.

2. **Leer la página de un rival en Meta pide "Page Public Content Access".** Es
   una revisión de app **de Composio**, no nuestra. Mientras no exista, el lado
   del rival se lee de su web pública y la pantalla dice por qué, con el texto
   del proveedor. Si Luis quiere el ritmo del rival de verdad, la vía es pedirle
   a Composio esa revisión o que el cliente sea admin de esa página.

3. **Al mergear, contra producción**: `npm run db:migrate` (crea `prospects`,
   `prospect_searches`, `project_competitors`, `competitor_snapshots`, `lessons`
   y las cuatro columnas nuevas de `creative_pieces`).

4. Siguen abiertos los bloqueos viejos: `HIGGSFIELD_ACCESS_TOKEN` fuera del
   entorno, Canva sin conectar en MOMENTUM, `CLERK_SECRET_KEY` y las
   `NEXT_PUBLIC_CLERK_*` fuera del entorno Preview, WABA en Business Manager y
   Twilio fuera de Trial.

## Siguiente acción

Mergear, correr `db:migrate`, meter la llave de Maps en Vercel y entrar a
`vliving.life/projects/<MOMENTUM>` — que ya no es una lista de pendientes.
Desde ahí, "restaurantes en Tulum" en Prospección da veinte negocios con
teléfono en una búsqueda, y el Asistente de la columna ancha ya sabe de
competencia, de prospección y de hasta dónde puede llegar solo.
