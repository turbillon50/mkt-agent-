# Radar de mercado

Los workers que miden el mercado DIRECTO —anuncios activos, plataformas, sitios— en vez de
leer lo que otros opinan de él. Es el principio 3 del issue #63.

**Dónde corre qué.** Lo que necesita navegador corre EN EL SERVIDOR y deja resultados escritos;
la app en Vercel solo los LEE. Por eso los workers viven aquí y no en `src/`: nada del build de
la app los importa y Playwright no entra al bundle.

```
motor/radar/workana.py        mide (navegador) → JSON estructurado
motor/radar/ingesta.ts        calcula y guarda → market_signals + radar_runs
src/motor/radar.ts            el cálculo puro, sin red y sin navegador (es lo que se prueba)
```

Ese reparto es el principio 4: **el modelo decide qué investigar, el código calcula y verifica.**
`src/motor/radar.ts` no importa Playwright ni llama a ningún modelo — recibe observaciones crudas
y saca las cifras a mano, para que cualquiera pueda rehacer la cuenta.

## Correrlo

```bash
export NVM_DIR=/root/.nvm; . $NVM_DIR/nvm.sh; nvm use 20

# 1. medir (tarda: va despacio a propósito, ver "el anti-bot" abajo)
python3 motor/radar/workana.py --salida /tmp/workana.json --pausa-ms 25000

# 2. calcular y guardar las señales del proyecto
npx tsx motor/radar/ingesta.ts --proyecto <uuid> --workana /tmp/workana.json --umbral 500 --moneda USD
```

## Regla

Todo número sale con **fecha, fuente, tamaño de muestra y método**. Si no hay dato, se dice y se
propone cómo medirlo (`hueco = true` + `como_medirlo`). Eso no es una costumbre: los CHECK de
`market_signals` (migración 0023) no dejan INSERTAR una cifra sin fuente, fecha y método.

## Medición del 30-sep-2026

### Precios reales en Workana — y una corrección al número semilla

`motor/radar/mediciones/workana-2026-09-30.json` guarda las 35 observaciones crudas, para poder
rehacer la cuenta sin volver a la red.

| | |
|---|---|
| Fuente | Workana, proyectos abiertos (plataforma) |
| Medido | 30-sep-2026 |
| Observados | 35 (5 subcategorías de software × página 1) |
| Entraron a la cuenta | 25 |
| Fuera | 10 por hora · 0 sin presupuesto · 0 en otra moneda |
| **No pasa de USD 500** (`tope <= 500`) | **84%** — 21 de 25 |
| **Menos de USD 500** (`tope < 500`) | **52%** — 13 de 25 |
| En el filo exacto de 500 | 8 |
| Mediana del tope | USD 250 |
| Propuestas por proyecto (mediana) | 36 |
| Publicados por hora | 28.6% de 35 |

**Los dos cortes se publican, y no es un adorno.** Los presupuestos vienen en bandas con topes
redondos, y "USD 250 - 500" cae justo en el filo del umbral. Según el corte que se elija, la misma
medición dice 84% o 52%. Enseñar solo uno sin decir cuál es el truco más fácil para que un número
verdadero diga lo que uno quiere.

**Y una corrección al número de la medición semilla.** La primera versión de este README decía
"6 de 7 con presupuesto de USD 100-500 **o por hora**", que sale ~86%. Eso junta dos cosas
distintas: un proyecto a USD 15-45/hora puede acabar en USD 5,000, así que no es un presupuesto
bajo. Ahora los proyectos por hora se marcan (`por_hora: true`) y el cálculo los saca del
numerador **y** del denominador, y dice cuántos fueron. Contarlos como "menos de USD 500" infla
la cifra y la vuelve indefendible enfrente de un comprador.

### Anuncios activos en la Biblioteca de Anuncios de Meta

- "desarrollo de apps" ~150 activos · "software a la medida" ~1,400 · "app movil precio" ~540.
  Son los totales que declara Meta: aproximados e incluyen coincidencias sueltas, y la cifra
  tiene que decirlo en vez de presentarse como un censo.
- De ~135 anuncios revisados a mano, ~20 anunciantes venden desarrollo real y **ninguno publica
  precio**.
- La API oficial (`ads_archive`) solo devuelve anuncios políticos fuera de la UE, por eso se lee
  la página pública.

## Límites medidos, no supuestos

1. **El anti-bot de Cloudflare corta la paginación.** Medido el 30-sep: `&page=2` devuelve
   "Verificación de seguridad en curso" con un Ray ID de Cloudflare. Y reusando el mismo contexto
   del navegador, solo la PRIMERA navegación entra: las siguientes también caen.
   Por eso el worker abre un contexto nuevo por subcategoría y espera 25 s entre una y otra, y la
   muestra se ensancha **a lo ancho** (varias subcategorías) y no a lo hondo. No se le da la
   vuelta al anti-bot: cada negativa se anota en `negadas` y la muestra se declara chica.
2. **Freelancer.com.mx** falló por certificado. Queda fuera y se dice.
3. **Reddit está bloqueado** para las herramientas del servidor. No se le da la vuelta.
4. **Google Trends** todavía no se mide: `pytrends-modern` no está instalado en el servidor
   (medido: `import pytrends` falla). Hoy entra como hueco declarado con su `como_medirlo`, no
   como un número inventado.

## Archivos

- `workana.py` — mide presupuestos reales de proyectos abiertos. Ojo: Workana en español usa el
  **punto como separador de miles** ("USD 1.000 - 3.000" son mil a tres mil). Leerlo como decimal
  es un error de tres ceros que invalida toda la medición de precios.
- `ingesta.ts` — calcula y guarda las señales del proyecto con su procedencia.
- `meta_ad_library.py` — lee la página pública de la Biblioteca de Anuncios de Meta.
- `freelance_presupuestos.py` — el guion semilla del 30-sep (volcado de texto). Lo dejó
  `workana.py`, que sí devuelve datos estructurados.
- `referencias_clonar.sh` — los repos abiertos de referencia que se estudiaron.
- `mediciones/` — el crudo de cada medición, fechado.
