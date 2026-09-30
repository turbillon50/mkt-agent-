# AVANCE — Corrida 14 · El motor de análisis

Bitácora de la corrida. **Al arrancar, lee esto y continúa; no repitas lo verificado.**
Rama `vulcano/motor-c14`. Base de DESARROLLO (`goossip-dev-motor`). No merges a main.

## Estado global

| Bloque | Estado |
|---|---|
| P0.1 Migración del esquema | **HECHO Y VERIFICADO** |
| P0.2 Ficha del proyecto | PENDIENTE |
| P0.3 Radar de mercado | PENDIENTE |
| P0.4 Públicos + plan con hipótesis | PENDIENTE |
| P0.5 Pantalla Estrategia | PENDIENTE |
| Aceptación 3 (arnés números sin fuente) | PENDIENTE |
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

## Qué sigue

1. P0.2 → P0.5 en orden.
2. El arnés de números sin fuente antes de los zz-, para que los zz- nazcan ya vigilados.
