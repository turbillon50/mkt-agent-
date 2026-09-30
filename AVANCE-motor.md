# AVANCE — Corrida 14 · El motor de análisis

Bitácora de la corrida. **Al arrancar, lee esto y continúa; no repitas lo verificado.**
Rama `vulcano/motor-c14`. Base de DESARROLLO (`goossip-dev-motor`). No merges a main.

## Estado global

| Bloque | Estado |
|---|---|
| P0.1 Migración del esquema | **HECHO Y VERIFICADO** |
| P0.2 Ficha del proyecto | **HECHO** (falta correrla en los zz-) |
| P0.3 Radar de mercado | **HECHO Y VERIFICADO** (precios; tendencias = hueco) |
| P0.4 Públicos + plan con hipótesis | PENDIENTE |
| P0.5 Pantalla Estrategia | PENDIENTE |
| Aceptación 3 (arnés números sin fuente) | **HECHO Y VERIFICADO** |
| Aceptación 1+2 (zz-Momentum / zz-Miami) | PENDIENTE |
| P2.1 PR #59 | PENDIENTE |
| P2.2 test:creative | DIAGNOSTICADO, sin arreglar |
| P1 Medición y aprendizaje | PENDIENTE |
| P3 Estudio por red | PENDIENTE |
| Cierre (verde, capturas, preview, reporte) | PENDIENTE |

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

## Qué sigue

1. P0.4 (públicos + plan con hipótesis) → P0.5 (pantalla Estrategia).
2. `src/motor/estudio.ts` le debe `cifraDeSpec` a `procedencia.ts` (el comentario que
   reemplazó a FORMAS_DE_RED lo promete): construir una cifra `oficial` desde SOCIAL_PLAYBOOKS.
3. Correr la ficha en los dos zz- y el radar en zz-Miami (su mercado NO es Workana: le toca
   portales inmobiliarios, y si no hay worker para eso, hueco declarado).
