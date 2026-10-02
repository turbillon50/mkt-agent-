# REPORTE — Corrida 14 · El motor de análisis

**Rama** `vulcano/motor-c14` · **PR** [#64](https://github.com/turbillon50/mkt-agent-/pull/64) ·
**Issue** #63 · 30-sep-2026 · 20 commits · 57 archivos · +13,086 líneas

Goossip ya no vende apps: vende **lo que le pongas enfrente**. Esta corrida le puso el motor que
lo hace posible — ficha, radar, públicos, plan con hipótesis, medición y estudio por red — y
**nada de ese motor sabe que alguna vez se vendieron apps**.

---

## 0. La decisión de fondo, en una idea

> **La regla "todo número con fecha, fuente, muestra y método" no vive en una prueba: vive en los
> CHECK de la base.**

Una prueba se puede olvidar de correr. Un `CHECK` no. `market_signals` **no acepta un INSERT** con
un valor que no traiga `fuente_tipo` + `fuente_nombre` + `medido_en` + `metodo`. Encima de eso hay
otros dos niveles: la calidad del dato la calcula el **código** (no el modelo — a un modelo le
preguntas si su dato es bueno y te dice que sí), y un **arnés** audita lo que se va a *mostrar*.

Todo lo demás de esta corrida cuelga de ahí.

---

## 1. Tabla de mejoras

| # | Qué | Antes → Después | Evidencia |
|---|---|---|---|
| 1 | Esquema del motor (migración 0023) | no existía → 6 tablas aditivas | `drizzle/0023_motor_analisis.sql` |
| 2 | La procedencia la impone la base | nada la impedía → 11 CHECK | 11/11 casos malos rechazados, 0 colados |
| 3 | Calidad del dato por código | la opinaba el modelo → `calidadDe()` | fuente + antigüedad + muestra |
| 4 | Arnés de números sin fuente | no existía → `auditar()` | `test:procedencia` 70 pasadas |
| 5 | Contraprueba del arnés | — → 10 pantallas malas, 10 reprobadas | + una corrida a mano fuera del test |
| 6 | Ficha del proyecto (paso 0) | no existía → se arma leyendo | `src/motor/ficha.ts` |
| 7 | La procedencia de cada campo se **verifica** | — → si el sitio no se leyó, baja a `modelo` | `origenVerificado()` |
| 8 | No se inventa precio | — → sin moneda no hay precio + pregunta al dueño | visible en las 2 capturas |
| 9 | Parser de precio: `1.5 millones` | se leía **1,500** → 1,500,000 | 10/10 casos |
| 10 | Parser de precio: `de 1,500 a 2 millones` | perdía los millones → correcto | 10/10 casos |
| 11 | Worker de radar estructurado | volcado de texto → JSON con campos | `motor/radar/workana.py` |
| 12 | Muestra del radar | 7 observaciones → **35** | contexto nuevo por subcategoría |
| 13 | "Por hora" ya no cuenta como presupuesto bajo | inflaba la cifra → se descarta y se dice | corrige el número semilla |
| 14 | Se publican los **dos** cortes del umbral | uno solo → 84% y 52%, con los del filo | `pctBajoUmbral()` |
| 15 | Negativas del radar registradas | se perdían → `radar_runs.negadas` | Cloudflare anotado |
| 16 | Huecos declarados con `como_medirlo` | vacío silencioso → tarea concreta | zz-Miami, 3 huecos |
| 17 | Públicos con `porque` obligatorio | — → lo exige la base | `audiences.porque NOT NULL` |
| 18 | La evidencia del modelo se **verifica** | se le creía → id inexistente se tira | como `compliance.ts` |
| 19 | Un **hueco no cuenta** como evidencia | contaba → solo cuentan las que miden | visto en zz-Miami |
| 20 | Los ids que el modelo mete en la prosa se **mueven** a evidencia | salían en la oferta → se reubican | `limpiarCitas()` |
| 21 | Restos `(ids,` al quitar citas | rompían la frase → limpios | `RESTOS_DE_CITA` |
| 22 | Métrica y objetivo los pone el código | los elegía el modelo → `METRICA_DE_OBJETIVO` | por etapa del público |
| 23 | Máximo 2 redes por público | "todo en todas" → hay que elegir | y se reporta lo tirado |
| 24 | Reglas de red citables | — → `cifraDeSpec` / `cifraDeLienzo` | con URL y fecha |
| 25 | Hipótesis por publicación | no existía → nace con métrica y meta | `post_hypotheses` |
| 26 | Frase de hipótesis partida en dos | `...minuto. ofreciéndole` → cosida | `fragmento()` |
| 27 | Etapa duplicada en el nombre | `Listo para comprar (Listo para comprar)` → una vez | `normalizar()` |
| 28 | Pantalla Estrategia | no existía → sección del proyecto | `/projects/[id]/estrategia` |
| 29 | Los números no se escriben en el JSX | — → pasan por `Afirmacion` | auditable sin React |
| 30 | Colas de `numeric(18,4)` en pantalla | `28.6000%` → `28.6%` | `valorEnPalabras()` |
| 31 | **Contraste ilegible** (defecto de captura) | `-300` en tema claro → `700/800` | solo se vio mirando |
| 32 | **Valores crudos de columna** (defecto de captura) | `retencion` sin acento → `Que el que ya te compró vuelva` | solo se vio mirando |
| 33 | Veredicto de hipótesis por código | — → `resultado >= meta` | no lo interpreta el modelo |
| 34 | Sin meta no se inventa veredicto | — → `sin_datos` y se explica | |
| 35 | Lo que una red no da, se dice | cero ambiguo → "no se pueden leer" + permiso | `CAPACIDAD_METRICA` |
| 36 | Lecciones de aciertos **y** de fracasos | — → las dos, y ninguna de lo no medido | reusa `lessons` |
| 37 | Atribución sin repartir a ojo | — → los sin origen se cuentan aparte | `cruceConVentas()` |
| 38 | Reporte semanal en español normal | no existía → "ganó / no salió / propongo" | y pasa el arnés |
| 39 | Estudio por red: 6 formas distintas | una pieza para todas → una por red | `RECETAS` |
| 40 | Kit de marca: **propone, no cambia** | — → decisión del dueño | por distancia de color |
| 41 | `test:creative` | 8 fallidas → **230 pasadas** | causa raíz, no parche |
| 42 | Ingesta de diseño multi-raíz | 1 ruta → varias, y dice dónde buscó | 0 → 364 pedazos |
| 43 | Umbral de la ingesta reapuntado | 500 del disco → repo duro (28/43) | el listón **subió** |
| 44 | Mensaje sin ruta (doctrina §9) | "no está conectado" → + `/conexiones` | |
| 45 | `test:projects` | rota (**la rompí yo**) → 41 pasadas | dueño en `project_members` |
| 46 | `test:corrida10` | **no se podía correr** → 132 pasadas | faltaba el script |
| 47 | `test:orgs` | exigía historia de producción → 38 pasadas | |
| 48 | **El linter llevaba corridas muerto** | `next lint` roto → `eslint .` en verde | desde d71aa79 |
| 49 | 4 errores de lint viejos | → arreglados | comillas, `<a>` a `/projects` |
| 50 | Falso positivo de `rules-of-hooks` | Baileys no es React → apagado ahí | |
| 51 | PR #59 integrado | en conflicto → mezclado | **sin bajar Next a 16.2.6** |
| 52 | Radar con nombre corto | 0 consultas **en silencio** → funciona | lo encontró la prueba nueva |
| 53 | Suite del motor | no existía → `test:motor` 118 pasadas | |

---

## 2. Las aceptaciones

### 1. Dos negocios distintos, estrategias distintas ✅

```
[ ok ] ofertas idénticas: ninguna
[ ok ] dolores idénticos: ninguno
[ ok ] argumentos del plan idénticos: ninguno
[ ok ] mismo juego de redes: zz-Momentum: facebook,instagram,linkedin,twitter
                           · zz-Miami: facebook,instagram,linkedin,tiktok,twitter,youtube
VEREDICTO: las dos estrategias son distintas. No es plantilla.
```

`compararCorridas()` está escrito **para acusar, no para tranquilizar**. Un matiz honesto:
coincidir de redes NO cuenta como sospechoso por sí solo (dos negocios distintos pueden coincidir
en que Instagram les sirve); lo que acusa es que además coincidan los argumentos.

### Cómo salió cada uno, y por qué difieren

|  | **zz-Momentum** | **zz-Miami** |
|---|---|---|
| Alta | "Hacemos aplicaciones móviles y web a la medida" | "Departamentos de preventa en Miami a compradores mexicanos" |
| Sitio | **404** — no se pudo leer | leído: *The Audrey Ross Team \| Miami Real Estate* |
| Solidez de la ficha | 0 medidos · 4 deducidos · 2 sin dato | **3 medidos** · 1 deducido · 2 sin dato |
| Preguntas al dueño | **6** | **3** |
| Radar | **5 señales medidas** (Workana) | **0 medidas · 3 huecos declarados** |
| Públicos con respaldo | 2 de 4 | 0 de 4 (todos marcados "SIN medición") |
| Redes | 4 | 6 |

**La diferencia no es cosmética, y su causa es rastreable.** zz-Momentum cita mediciones reales en
el porqué de sus públicos ("el 84% de los proyectos no supera 500 USD, y eso genera desconfianza en
la calidad: ofrecemos claridad y garantía"). zz-Miami **no tiene mercado medido** — su mercado no
es Workana — así que sus cuatro públicos salen marcados como propuesta del analista y el radar
enseña tres huecos con su "así se mediría", en vez de inventarse un respaldo.

Y el motor **se adapta sin que nadie le explique nada**: a Momentum le hace 6 preguntas porque no
pudo leer su sitio; a Miami le hace 3 porque sí lo leyó. Nadie programó esa diferencia.

### 2. Contestar midiendo ✅

> ¿Qué porcentaje de los proyectos de apps publicados en Workana tiene presupuesto menor a USD 500?

| | |
|---|---|
| **No pasa de USD 500** (`tope <= 500`) | **84%** — 21 de 25 |
| **Menos de USD 500** (`tope < 500`) | **52%** — 13 de 25 |
| Exactamente en el filo de 500 | 8 |
| Observados / entraron a la cuenta | 35 / 25 |
| Fuera | 10 por hora · 0 sin presupuesto · 0 en otra moneda |
| Mediana del tope | USD 250 |
| Propuestas por proyecto (mediana) | 36 |
| Publicados por hora | 28.6% de 35 |
| **Fuente** | Workana, proyectos abiertos, 5 subcategorías × página 1 |
| **Fecha** | 30-sep-2026 |
| **Método** | conteo directo del tope publicado; crudo en `motor/radar/mediciones/workana-2026-09-30.json` |

**Dos decisiones de método que cambian el número, y por eso van escritas:**

1. **Los proyectos "por hora" salen del numerador Y del denominador.** Uno a USD 15-45/hora puede
   acabar en USD 5,000. El README semilla decía "6 de 7 con USD 100-500 **o por hora**" (~86%),
   juntando dos cosas distintas. **Este reporte corrige ese número.**
2. **Se publican los dos cortes.** Las bandas traen topes redondos y "USD 250-500" cae justo en el
   filo: la misma medición dice 84% o 52% según el corte. Enseñar uno solo sin decir cuál es el
   truco más fácil para que un número verdadero diga lo que uno quiere.

### 3. Arnés de números sin fuente, con contraprueba ✅

`npm run test:procedencia` → **70 pasadas, 0 fallidas**. Dentro: 10 pantallas malas a propósito,
las 10 reprobadas y cada una clasificada. Fuera, a mano:

```
El mercado mexicano de apps creció 30% en 2026 y ya vale 1,200 millones de dólares.
La mayoría de los competidores cobra entre USD 3,000 y USD 8,000.
→ 2 número(s) sin procedencia, señalando los dígitos exactos (30, 2026, 1,200 / 3,000, 8,000)
```

**Un agujero que abrí y cerré**, y queda escrito para que nadie lo reabra: la primera versión traía
una lista de excepciones para escribir a mano las medidas de plataforma. La prueba la reventó con
"8-12 láminas" y **la tentación era ampliar la lista**. Se quitó completa: una lista de excepciones
es por donde se cuela "el mercado creció 30%" disfrazado de rango, y la premisa era falsa — una
spec de red tiene una fuente buenísima, que este repo ya guardaba con URL y versión.

### 4. Verde ✅

| | |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm run lint` | **exit 0** (39 avisos, todos impresos, ninguno en el motor) |
| `npm run build` | **exit 0** |
| **16 suites de prueba** | **16 en verde, 0 en rojo** |

### 5. Capturas WebKit miradas ✅ — con dos defectos que ninguna prueba iba a atrapar

4 capturas (1440 y 390 × 2 proyectos), 0 defectos automáticos. **Lo que se vio al mirarlas:**

1. **Contraste.** Se usaban `text-amber-300/emerald-300/rose-300`, tonos de fondo **oscuro**, y el
   tema de Goossip es **claro**. Los avisos que más importan —"no hay ninguna medición que lo
   sostenga", "esto lo deduje yo"— salían lavados. **Justo los renglones que sostienen la
   honestidad de la pantalla eran los ilegibles.**
2. **Valores crudos de la columna.** El plan enseñaba `descubrimiento` y `retencion` tal cual — y
   `retencion` **sin acento**, porque un identificador no lleva acentos.

**Cómo se capturó, dicho claro:** no se pudo navegar la app con sesión real porque el `.env.local`
de dev trae las llaves de Clerk **vacías** y `/projects/<id>/estrategia` da **HTTP 500** en local.
Se capturó el componente **real** con datos **reales** y el CSS **real** compilado, fuera del
cascarón de navegación. Atrapa desborde, contraste y texto cortado; **no** atrapa el menú ni la
sesión. El guion con sesión Clerk queda escrito para cuando haya llaves. → BLOQUEOS #1.

### 6. Preview de Vercel ⚠️ PARCIAL

El preview quedó **READY** (Vercel: `success`). Pero `/sign-in` contesta **302**, no 200: el
proyecto tiene **Protección de Despliegues** y redirige a `vercel.com/sso-api`. No es la app.
Apagarla o generar un token de bypass es tocar la configuración de Vercel, que esta corrida me
prohíbe. **Verificado contra el mismo código** compilado en producción y corriendo local:
`/sign-in` → **HTTP 200**. → BLOQUEOS #6.

---

## 3. Los números medidos, con su fuente

| Número | Valor | Fuente | Fecha | Muestra | Calidad |
|---|---|---|---|---|---|
| Proyectos que no pasan de USD 500 | 84% | Workana (plataforma) | 30-sep | 25 de 35 | media |
| Los mismos, corte estricto | 52% | Workana (plataforma) | 30-sep | 25 de 35 | media |
| Mediana del tope de presupuesto | USD 250 | Workana (plataforma) | 30-sep | 25 | media |
| Propuestas por proyecto (mediana) | 36 | Workana (plataforma) | 30-sep | 25 | media |
| Proyectos publicados por hora | 28.6% | Workana (plataforma) | 30-sep | 35 | alta |
| Anuncios activos MX "desarrollo de apps" | ~150 | Biblioteca de Anuncios de Meta | 30-sep | total declarado, aproximado | baja |
| Anunciantes que publican precio | **ninguno** | Biblioteca de Anuncios de Meta | 30-sep | ~135 revisados | media |

Y lo que **no** se pudo medir, declarado como hueco con su vía: precios del mercado inmobiliario
de Miami · competidores activos de zz-Miami · tendencias de búsqueda (Google Trends).

---

## 4. Lo que NO quedó, y su causa

| Qué | Causa | Dónde |
|---|---|---|
| Captura navegando la app con sesión | llaves de Clerk **vacías** en dev → la ruta da 500 | BLOQUEOS #1 |
| `/sign-in` 200 **en el preview** | Protección de Despliegues de Vercel (302 a SSO) | BLOQUEOS #6 |
| Insights de Meta Ads | `ads_read` no otorgado al usuario de sistema | BLOQUEOS #2 |
| Métricas de LinkedIn | la conexión solo publica; falta `r_organization_social` | BLOQUEOS #3 |
| Google Trends | `pytrends` no está instalado (medido: `import` falla) | BLOQUEOS #4 |
| Escucha social de Reddit | bloqueado para el servidor; **no se le dio la vuelta** | BLOQUEOS #5 |
| Radar del mercado inmobiliario | no hay worker de portales; **3 huecos declarados** | deuda abierta |
| Paginación profunda en Workana | Cloudflare corta; se ensanchó a lo ancho (35) | anotado en `negadas` |
| 306 errores de `eslint/typescript` | escalón nuevo; decisión de Luis | BLOQUEOS #7 |
| 34 avisos del React Compiler | reglas que no existían cuando se escribió el código | BLOQUEOS #7 |

**Nada de esto se disimuló**: cada hueco aparece en la pantalla con su "así se mediría", y cada
permiso faltante con el paso exacto que lo destraba.

---

## 5. Migraciones que hay que aplicar en producción

**Una sola, y es aditiva:**

```bash
npm run db:migrate   # aplica drizzle/0023_motor_analisis.sql
```

`0023_motor_analisis.sql` crea seis tablas con `CREATE TABLE IF NOT EXISTS` y **no toca ni una
tabla existente**: ningún `DROP`, ningún `ALTER` destructivo, ninguna transformación de datos.
No requiere ventana de mantenimiento.

Después de aplicarla, para que la memoria de diseño no quede vacía:

```bash
npm run ingest:diseno   # idempotente: correrla dos veces escribe cero pedazos
```

**Lo que NO hay que aplicar:** nada de los proyectos `zz-`. Viven solo en la base de desarrollo,
bajo la organización `org_zz_motor`, y se borran con `npx tsx scripts/zz-proyectos.ts borrar`.

---

## 6. Lo que esta corrida tocó fuera del motor, y por qué

Tres cosas que no estaban en el encargo pero que estaban rotas y bloqueaban el trabajo:

1. **El linter llevaba corridas muerto.** `npm run lint` era `next lint`, Next 16 lo quitó, y desde
   d71aa79 fallaba con "no such directory: .../lint". Nadie lo vio porque nadie leía la salida.
2. **`test:corrida10` no tenía script.** 132 pruebas en el repo que nadie podía correr.
3. **`test:orgs` exigía la historia de producción.** Pedía una org que es el resultado de un
   acarreo de una sola vez; en una base nacida limpia el rojo no era un defecto. Un rojo que no es
   defecto es el camino más corto a que la gente deje de leer las pruebas.

Y una que **rompí yo** y arreglé: `scripts/zz-proyectos.ts` creaba proyectos sin dueño y reventó
`test:projects`. Un dato de prueba tiene que cumplir las mismas reglas que un dato de verdad.

---

## 7. Límites que se respetaron

- **No se publicó nada**, no se gastó en anuncios, no se le mandó mensaje a nadie.
- **Los proyectos reales no se tocaron**: todo corrió bajo `org_zz_motor` en la base de desarrollo.
- **No se tocaron las variables de Vercel** ni la base de producción.
- **No se le dio la vuelta a Reddit ni al anti-bot de Cloudflare**: las dos negativas se anotaron.
- **Ningún dato inventado** en pantallas, semillas ni en este reporte. Los resultados sintéticos con
  que se probó la medición **se borraron** al terminar, precisamente porque en la pantalla se
  habrían visto como reales.
- **No se cambió el kit de ningún proyecto real**: el motor propone y la decisión queda del dueño.
- **No se mergeó a main.** El PR #64 queda abierto para revisión.

FIN-MOTOR
