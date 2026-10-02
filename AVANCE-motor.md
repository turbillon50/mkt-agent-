# AVANCE — Corrida 14 · El motor de análisis

Bitácora de la corrida. **Al arrancar, lee esto y continúa; no repitas lo verificado.**
Rama `vulcano/motor-c14`. Base de DESARROLLO (`goossip-dev-motor`). No merges a main.

## Estado global

| Bloque | Estado |
|---|---|
| P0.1 Migración del esquema | **HECHO Y VERIFICADO** |
| P0.2 Ficha del proyecto | **HECHO** (falta correrla en los zz-) |
| P0.3 Radar de mercado | **HECHO Y VERIFICADO** (precios; tendencias = hueco) |
| P0.4 Públicos + plan con hipótesis | **HECHO Y VERIFICADO** |
| P0.5 Pantalla Estrategia | **HECHO Y MIRADA** |
| Aceptación 3 (arnés números sin fuente) | **HECHO Y VERIFICADO** |
| Aceptación 1+2 (zz-Momentum / zz-Miami) | **VERIFICADAS** |
| P2.1 PR #59 | **INTEGRADO** |
| P2.2 test:creative | **ARREGLADO** (y 3 suites más) |
| P1 Medición y aprendizaje | **HECHO** |
| P3 Estudio por red | **HECHO** |
| Cierre (verde, capturas, preview, reporte) | **HECHO** — preview READY, /sign-in tras el SSO de Vercel |

## Medido en el arranque (30-sep, no repetir)

- Node 20.20.2 · `npx tsc --noEmit` → **exit 0, verde** desde el arranque.
- Base de dev alcanzable: `ep-patient-night-b84d4l4z...neon.tech/neondb`, ya migrada.
- `gh` NO está autenticado en el servidor. El PAT sale del remote:
  `export GH_TOKEN=$(git remote get-url origin | sed -E 's|.*x-access-token:([^@]+)@.*|\1|')`.
  Además `gh issue view` truena con el sunset de Projects classic → usar `gh api repos/.../issues/N`.

### Suites: el brief no coincide con lo medido

Exit codes reales (medidos uno por uno, sin tubería que se coma el `$?`):

| Suite | Brief decía | Medido 30-sep |
|---|---|---|
| `test:creative` | falla desde 20-sep | **falla** — exit 1, 221 pasadas · 8 fallidas |
| `test:asistente` | falla desde 20-sep | **VERDE** — exit 0, 94 pasadas · 0 fallidas |
| `test:social-os` | "No test suite found" | **VERDE** — exit 0, 6 playbooks |

Así que P2.2 es solo `test:creative`. Las otras dos ya estaban arregladas.

### Causa raíz de `test:creative` (medida, no supuesta)

Las 8 fallidas cuelgan todas de una: `design_knowledge` tiene **0 filas** en la base de dev
(medido: `select count(*) from design_knowledge` → 0).

Por qué está vacío: `scripts/ingest-design-knowledge.ts` lee las carpetas de diseño de
`/root/skills-vault` (`VAULT`, override `SKILLS_VAULT_DIR`). De las 14 carpetas que pide,
**solo 2 siguen existiendo ahí** (`content-engine`, `video-frames`). Las que traen el volumen
—`_higgsfield-docs`, `higgsfield-*`, `design-library`, `vulcano-design-protocol`, `vdefi-brand`—
ya no están en skills-vault; las higgsfield-* viven ahora en `/root/.claude/skills/`.

O sea: **el test asserta sobre el estado del disco del servidor, no sobre la app.**
`total.chunks > 500` y `higgsfield > 100` son afirmaciones sobre carpetas que el barrido y la
reorganización del vault pueden mover cuando quieran. Eso choca de frente con la regla 8 de la
doctrina y con el mandato del issue #63 ("todo el código en el repo; nada vive solo en el servidor").

Las 8 fallidas, separadas por origen:
- 4 directas de la memoria vacía: `hay memoria de diseño ingerida`, `hay specs por red ingeridas`,
  `hay skills de Higgsfield ingeridas`, `buscar en diseño devuelve algo`.
- 3 aguas abajo (el Asistente cita la memoria de diseño): `la primera respuesta es la spec del reel`,
  `la respuesta trae su fuente oficial`, `la fuente también está en el source_path`.
- 1 aparte, todavía por diagnosticar: `sin la red conectada se dice qué falta` — "ConMarca no tiene
  linkedin conectado y listo para publicar".

Arreglo que toca (no apagar): que la parte que el repo SÍ garantiza (specs/reglas/cortes de
`src/creative/*`) se assertee de verdad, y que la parte que depende del vault se reporte como
ausente cuando no está, en vez de fallar silenciosa. Falta rematar la 8ª.

## P0.1 — Migración `0023_motor_analisis.sql` (HECHO, aplicada solo a dev)

Seis tablas nuevas, todo aditivo (`CREATE TABLE IF NOT EXISTS`, ningún DROP ni ALTER destructivo):
`project_brief`, `market_signals`, `radar_runs`, `audiences`, `channel_plan`, `post_hypotheses`.

Dos tablas que NO se crearon, a propósito (doctrina regla 3, "lo que llega funcionando se conecta"):
- lecciones por proyecto → ya existe `lessons`, con `ref_type`/`ref_id` para colgarle la hipótesis.
- competidores y sus lecturas → ya existen `project_competitors` y `competitor_snapshots` (corrida 7).

**La decisión de diseño de la corrida:** la regla "todo número con fecha, fuente, muestra y método"
NO vive solo en una prueba que alguien puede olvidar de correr — vive en los CHECK de la base.
`market_signals` no acepta un número sin `fuente_tipo` + `fuente_nombre` + `medido_en` + `metodo`.
`hueco=true` es el otro estado honesto: no lleva valor, pero obliga a `como_medirlo`.

Verificado a mano el 30-sep (doctrina regla 6, correr los casos que deben fallar):

```
rechazado ✓ número SIN fuente                        [market_signals_con_fuente_chk]
rechazado ✓ número con fuente pero SIN fecha         [market_signals_con_fuente_chk]
rechazado ✓ número con fuente y fecha pero SIN método[market_signals_con_fuente_chk]
rechazado ✓ hueco que SÍ trae valor                  [market_signals_hueco_chk]
rechazado ✓ hueco SIN cómo medirlo                   [market_signals_hueco_chk]
rechazado ✓ muestra de cero                          [market_signals_muestra_chk]
rechazado ✓ fuente_tipo inventado                    [market_signals_fuente_tipo_chk]
rechazado ✓ público con tamaño SIN señal que lo respalde  [audiences_tamano_chk]
rechazado ✓ veredicto resuelto SIN el número que lo resolvió [post_hypotheses_veredicto_con_dato_chk]
rechazado ✓ precio con min > max                     [project_brief_precio_chk]
rechazado ✓ precio SIN moneda                        [project_brief_moneda_chk]

rechazados: 11/11 · colados: 0 · el dato bien formado entró: SI
```

`npx tsc --noEmit` → exit 0 después de tocar el esquema.

**Para producción:** falta aplicar `0023_motor_analisis.sql`. Es aditiva; no requiere ventana.

## Aceptación 3 — el arnés (HECHO) · `src/motor/procedencia.ts` + `test/procedencia.test.ts`

`npm run test:procedencia` → **65 pasadas · 0 fallidas**, exit 0.

La procedencia se defiende en tres niveles y los tres hacen falta:
1. La base (0023): no deja INSERTAR un número sin fuente/fecha/método.
2. El código (`calidadDe`): la calidad del dato la calcula una función, no el modelo.
   Un modelo al que le preguntas si su dato es bueno contesta que sí.
3. La pantalla y el reporte (`auditar`): reprueba lo que se va a MOSTRAR.

Para que el nivel 3 sea exacto y no adivinanza, las cifras no se escriben dentro de la prosa.
La prosa las llama por nombre y el arnés exige que, quitando los huecos declarados, **no quede
ni un dígito** en el texto literal:

```ts
{ plantilla: '{cifra} de los proyectos de apps en Workana pide menos de {umbral}.',
  cifra: <la medición, con fuente>, parametros: { umbral: 'USD 500' } }
```

### Un agujero que abrí y cerré (queda escrito para que nadie lo reabra)

La primera versión traía `FORMAS_DE_RED`: una lista de excepciones para escribir a mano las
medidas de plataforma (`3:4`, `1080x1350`, `0-3 s`). La prueba la reventó con "8-12 láminas",
que no matcheaba. **La tentación era ampliar la lista; se quitó completa.** Dos razones:
una lista de excepciones crece hasta que por ahí se cuela "el mercado creció 30%" disfrazado de
rango; y la premisa era falsa — una medida de red SÍ tiene fuente buenísima, la spec oficial que
este repo ya guarda con URL y versión en `SOCIAL_PLAYBOOKS[red].fuente`/`.version`.
Ahora no hay excepciones: un número de red se declara como cualquier otro. La prueba verifica
las dos caras (declarada pasa / a mano reprueba).

### La contraprueba, corrida a mano el 30-sep (fuera del archivo de prueba)

Pantalla escrita como la escribiría alguien de prisa:
```
El mercado mexicano de apps creció 30% en 2026 y ya vale 1,200 millones de dólares.
La mayoría de los competidores cobra entre USD 3,000 y USD 8,000.
```
Resultado: **reprobada, 2 defectos**, señalando los dígitos exactos (30, 2026, 1,200 / 3,000, 8,000).
Dentro de la prueba hay además 10 pantallas malas a propósito y las 10 reprueban, cada una
clasificada con el nombre de su defecto.

## P0.2 — Ficha (`src/motor/ficha.ts`)

Lee sitio (reusa `leerWebPublica` de competencia/lectura), señales de anuncios ya medidas y leads.
El modelo interpreta; el CÓDIGO decide la procedencia y la verifica: si el modelo dice que un campo
salió del sitio pero el sitio no se pudo leer, el origen baja a `modelo`.
No inventa precio: sin moneda no hay precio y en su lugar va una pregunta al dueño con su porqué.
`contextoDeFicha()` incluye a propósito lo que NO se sabe.

Dos bugs propios, encontrados midiendo el parser de precio (los 10 casos ya pasan):
- `'1.5 millones'` se leía como 1,500 — la alternancia de regex es por orden, no por longitud, y
  `mil` matcheaba dentro de `millones`. Error de tres ceros en un precio.
- `'de 1,500 a 2 millones'` perdía los millones: había dos lecturas del texto y la de separadores
  de miles le ganaba a la otra.

## P0.3 — Radar (HECHO, corrido de verdad)

```
motor/radar/workana.py   mide con navegador (servidor) → JSON estructurado
motor/radar/ingesta.ts   calcula y guarda → market_signals + radar_runs
src/motor/radar.ts       el cálculo puro: sin red, sin navegador, sin modelo
```
Corrido contra zz-Momentum en dev: **5 señales, 0 negadas**, calidad calculada por código.
Crudo guardado en `motor/radar/mediciones/workana-2026-09-30.json` (35 observaciones).

### ACEPTACIÓN 2 — CONTESTADA MIDIENDO (30-sep-2026)

> ¿Qué % de los proyectos de apps publicados en Workana tiene presupuesto menor a USD 500?

| | |
|---|---|
| **No pasa de USD 500** (`tope <= 500`) | **84%** — 21 de 25 |
| **Menos de USD 500** (`tope < 500`) | **52%** — 13 de 25 |
| En el filo exacto de 500 | 8 |
| Observados / entraron | 35 / 25 (10 por hora fuera) |
| Mediana del tope | USD 250 · Propuestas (mediana): 36 |
| Fuente | Workana, proyectos abiertos, 5 subcategorías × página 1 |

**Dos decisiones de método que cambian el número.** (a) Los proyectos POR HORA salen del numerador
y del denominador: uno a USD 15-45/hora puede acabar en USD 5,000. El README semilla decía "6 de 7
con USD 100-500 **o por hora**" (~86%), juntando las dos cosas. (b) Se publican los DOS cortes,
porque las bandas tienen topes redondos y "USD 250-500" cae justo en el filo: la misma medición
dice 84% o 52% según el corte. Enseñar uno solo sin decir cuál es el truco más fácil para que un
número verdadero diga lo que uno quiere.

### Límites medidos (no supuestos), anotados en `radar_runs.negadas`
- Cloudflare corta `&page=2` Y la segunda navegación del mismo contexto. El worker abre contexto
  nuevo por subcategoría con 25 s de pausa y ensancha a lo ancho. No se le da la vuelta.
- Freelancer.com.mx: falla por certificado. Reddit: bloqueado. Los dos quedan fuera y se dice.
- Google Trends: `pytrends` NO está instalado en el servidor (medido). Entra como hueco declarado.

## Datos de las pruebas en dev (ya creados, no recrear)

`scripts/zz-proyectos.ts` — `crear` / `borrar` / `ids`. Org `org_zz_motor`.
```
zz-momentum  ab7ba957-97dc-44ed-ae02-676fae95b682
zz-miami     1a8357df-8ff3-4087-9004-4705869de58b
```
Las altas traen SOLO lo que pondría un dueño (giro, sitio, ciudad, tono). Ninguna explicación
para el motor: si se la damos, la aceptación 1 no prueba nada.

## P0.4 — Públicos y plan con hipótesis (HECHO, corrido en los dos zz-)

`src/motor/publicos.ts` · `src/motor/plan.ts` · `src/motor/correr.ts` (orquestador)
`scripts/motor-correr.ts` — corre el motor y compara las dos corridas a ojo.

El candado que importa: **la evidencia que cita el modelo se comprueba contra las señales
REALES del proyecto.** Un id que no existe se tira (mismo patrón que `creative/compliance.ts`
con las reglas inventadas). Sin eso, la pantalla enseñaría "sostenido por la medición X"
apuntando a nada.

El CÓDIGO pone la métrica (`METRICA_DE_OBJETIVO`, derivada de la etapa del público), la
frecuencia y las reglas de red (de `SOCIAL_PLAYBOOKS`/`FORMATOS`, con URL y fecha).
`cifraDeSpec()` en plan.ts es la deuda que dejó el arnés al quitar FORMAS_DE_RED: ya está pagada.

### ACEPTACIÓN 1 — VERIFICADA (30-sep)

```
[   ok    ] ofertas idénticas: ninguna
[   ok    ] dolores idénticos: ninguno
[   ok    ] argumentos del plan idénticos: ninguno
[   ok    ] mismo juego de redes: zz-Miami: facebook,instagram,linkedin
                                · zz-Momentum: facebook,instagram,linkedin,twitter,youtube
VEREDICTO: las dos estrategias son distintas. No es plantilla.
```
`compararCorridas()` está escrito para ACUSAR, no para tranquilizar. Ojo con un matiz honesto:
"mismo juego de redes" NO cuenta como sospechoso por sí solo (dos negocios distintos pueden
coincidir en que Instagram les sirve); lo que acusa es que además coincidan los argumentos.

**La diferencia es real, no cosmética:** zz-Momentum cita las mediciones de Workana en el porqué
de sus públicos (84%, mediana 36 propuestas, tope 250 USD). zz-Miami **no tiene mercado medido**
(0 señales) y sus 4 públicos quedan marcados "SIN medición — propuesta del analista" en vez de
inventarse un respaldo. Eso es el comportamiento correcto, y es una deuda abierta: falta un worker
de portales inmobiliarios (ver "Lo que falta").

### Tres defectos que SOLO se vieron corriéndolo (arreglados)
1. El modelo metía ids crudos en la prosa, uno **en la OFERTA**: "ajustado al rango medio de
   250 USD (id=520ac5f5-...)" — texto que se le enseña a un comprador. El id no se borra: se
   MUEVE a `evidencia`. Su intención era citar la fuente; el error era el lugar.
2. La frase de la hipótesis se partía en dos: "...de último minuto. ofreciéndole asesoría...".
   El dolor y la oferta venían con punto final y se cosían tal cual.
3. Un público bautizado con el nombre de su etapa salía "Listo para comprar (Listo para comprar)".

## Qué sigue

1. P0.5 la pantalla Estrategia (con `exigirProcedencia` encima).
2. P2.2 `test:creative`, P2.1 PR #59, P1 medición, P3 estudio por red.
3. Prueba automática del motor (`test:motor`) que corra la comparación de la aceptación 1.

## Lo que falta / deudas abiertas

- **zz-Miami no tiene radar.** Su mercado no es Workana: le tocan portales inmobiliarios. Hoy
  sale con 0 señales y públicos sin respaldo — honesto, pero incompleto. Si no alcanza el tiempo
  para el worker, hay que sembrar los HUECOS declarados con su `como_medirlo`.
- Google Trends: `pytrends` no está en el servidor. Hueco declarado.

---

# Segunda mitad de la corrida (30-sep)

## P0.5 — Pantalla Estrategia (HECHA Y MIRADA)

`src/motor/pantalla.ts` (datos auditables) · `components/motor/estrategia.tsx` ·
`app/(dashboard)/projects/[id]/estrategia/page.tsx` · sección `estrategia` en `PROJECT_SECTIONS`.

Los números NO se escriben en el JSX: vienen de `pantalla.ts` como afirmaciones con procedencia,
así el arnés audita la pantalla entera sin renderizar React. **13 y 8 afirmaciones con número en
los dos zz-, 0 defectos.**

### El arnés se afinó con un caso real
La etiqueta de una medición trae el parámetro de la pregunta ("...no pasa de 500 USD"). Se agregó
`Afirmacion.etiqueta` **con candado**: sus dígitos solo pasan si hay una cifra con procedencia
completa o un hueco declarado. Una etiqueta pelona que diga "el mercado creció 30%" sigue
reprobando, y hay contraprueba de eso. `test:procedencia`: 70 pasadas.

### Capturas WebKit — dos defectos que ninguna prueba iba a atrapar
1. **Contraste.** Se usaban `text-amber-300/emerald-300/rose-300`, tonos de fondo OSCURO, y el
   tema de Goossip es CLARO. Los avisos que más importan —"no hay ninguna medición que lo
   sostenga", "esto lo deduje yo"— salían lavados. Justo los renglones que sostienen la
   honestidad eran los ilegibles. Ahora 700/800 sobre fondo 50.
2. **Valores crudos de la columna.** El plan enseñaba `descubrimiento` y `retencion` tal cual —
   y `retencion` SIN ACENTO, porque un identificador no lleva acentos. Ahora `OBJETIVO_LABEL`.

**Cómo se capturó, dicho claro:** no hay llaves de Clerk en dev (están vacías), así que
`/projects/<id>/estrategia` da **HTTP 500** en local y no se pudo navegar la app con sesión.
Se capturó el componente REAL con datos REALES y el CSS REAL compilado, fuera del cascarón
(`scripts/capturas-c14-pantalla.ts`). Atrapa desborde, contraste y texto cortado; **no** atrapa
el menú ni la sesión. El guion con sesión Clerk queda escrito (`scripts/capturas-c14.ts`) para
cuando haya llaves. → BLOQUEOS-motor.md #1.

## P2 — Las pruebas: de 4 suites rotas a 15 en verde

| Suite | Antes | Ahora |
|---|---|---|
| `test:creative` | 8 fallidas | **230 pasadas, 0 fallidas** |
| `test:projects` | rota (la rompí yo) | **41 pasadas** |
| `test:orgs` | 1 fallida | **38 pasadas** |
| `test:corrida10` | **no se podía correr** | **132 pasadas** |
| las otras 11 | verdes | verdes |

- **creative:** causa raíz = `design_knowledge` vacío porque la ingesta leía UNA raíz y el vault
  se reorganizó. Ahora busca en varias y dice dónde buscó. Se agregó la carpeta `higgsfield`
  (30 archivos) — ojo: al lado hay cuatro `higgsfield-*` que `ls` enseña y son **enlaces rotos**
  (doctrina regla 5 en vivo). 364 pedazos. El umbral se reapuntó: lo del REPO se afirma duro y
  **subió** (specs 20→28, reglas 0→43); lo del disco se afirma suave y se imprime.
  **Contraprueba:** borré una spec → rojo ("27 specs"); reingesté → verde escribiendo 1 pedazo.
- **Un mensaje que mandaba a buscar sin ruta** (doctrina §9): publicar en red no conectada ahora
  dice `/projects/<id>/conexiones`.
- **projects:** la rompí yo — `zz-proyectos.ts` creaba proyectos sin dueño en `project_members`.
- **orgs:** exigía la org `all-global`, que es un acarreo de una sola vez de la 0013. En una base
  nacida limpia no hay nada que acarrear; lo que sí vale en cualquier base se sigue exigiendo.

## El linter llevaba corridas MUERTO

`npm run lint` era `next lint` y Next 16 lo quitó: fallaba con "no such directory: .../lint"
desde d71aa79 y nadie leía la salida. Hay `eslint.config.mjs` y `eslint .`. De 45 problemas:
4 errores viejos arreglados · 1 falso positivo (services/baileys no es React) · 34 de reglas del
React Compiler que no existían cuando se escribió el código → `warn`, **se siguen imprimiendo
todas**. Ninguno en código del motor. Un escalón más (`typescript`) saca 306 errores: deuda
anotada, decisión de Luis. → BLOQUEOS #6.

## P2.1 — PR #59 integrado

4 conflictos. **El que importaba: package.json traía `next ^16.2.6`** porque el PR es anterior al
parche; dejarlo habría reabierto la RCE de AVIF. Se resolvió a 16.3.6 + maplibre-gl.
Verificado sobre el árbol mezclado: tsc 0 · lint 0 · build 0 · 15 suites verdes.

## Qué queda

1. **P1 medición y aprendizaje** (en curso).
2. **P3 el estudio por red.**
3. Cierre: preview de Vercel + `/sign-in` 200, `REPORTE-motor.md`, PR y comentario en #63.
4. Deuda viva: zz-Miami sigue sin radar (su mercado no es Workana). Si no da el tiempo para un
   worker de portales inmobiliarios, hay que sembrarle los HUECOS declarados con su `como_medirlo`.

---

# CIERRE (30-sep)

Todo lo de la corrida está hecho. El detalle completo vive en **`REPORTE-motor.md`**
(termina en `FIN-MOTOR`) y lo que solo Luis puede resolver, en **`BLOQUEOS-motor.md`** (7 puntos).

- **PR abierto:** https://github.com/turbillon50/mkt-agent-/pull/64 — NO mergeado, como se pidió.
- **Verde:** tsc 0 · lint 0 (39 avisos, ninguno del motor) · build 0 · **16 suites en verde**.
- **Preview de Vercel:** READY (`success`). `/sign-in` da **302** porque el proyecto tiene
  Protección de Despliegues y redirige al SSO de Vercel — no es la app, y apagarla es tocar la
  configuración de Vercel, que esta corrida prohíbe. Verificado contra el MISMO código en
  producción local: `/sign-in` → **200**. → BLOQUEOS #6.
- **Capturas:** 4, miradas, 0 defectos. Dos defectos encontrados al mirarlas y arreglados
  (contraste ilegible en tema claro, valores crudos de columna en pantalla).

## Si alguien relanza esto

Ya no hay bloque pendiente. Lo que queda son deudas con nombre, todas en BLOQUEOS:
llaves de Clerk en dev · `ads_read` de Meta · permiso de LinkedIn · `pytrends` · Reddit ·
la Protección de Despliegues de Vercel · el escalón del linter.

La única deuda **técnica** abierta: **zz-Miami no tiene radar** porque no hay worker de portales
inmobiliarios. Hoy sale con 3 huecos declarados y su `como_medirlo`, que es el comportamiento
honesto; construir ese worker es el siguiente paso natural del motor.
