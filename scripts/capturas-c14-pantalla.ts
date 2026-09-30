/**
 * Capturas de la pantalla Estrategia, en WebKit, a 1440 y a 390.
 *
 *   NODE_OPTIONS=--max-old-space-size=3072 npm run build   # hace falta el CSS compilado
 *   npx tsx scripts/capturas-c14-pantalla.ts
 *
 * POR QUÉ ESTE GUION Y NO EL DE LA APP COMPLETA
 * ---------------------------------------------
 * Lo primero que se intentó fue `scripts/capturas-c14.ts`: montar una sesión REAL
 * de Clerk y navegar la app como una persona. No se pudo, y la causa está medida:
 * el `.env.local` de esta base de DESARROLLO trae las llaves de Clerk **vacías**
 * (`CLERK_SECRET_KEY=""` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""`), así que
 * `/projects/<id>/estrategia` contesta **HTTP 500** en el servidor local. Está
 * anotado en BLOQUEOS-motor.md porque solo Luis puede dar esas llaves.
 *
 * Así que se mira lo que SÍ se puede mirar, y se dice exactamente qué es: el
 * componente REAL (`components/motor/estrategia.tsx`) renderizado con los datos
 * REALES de la base de desarrollo y con el CSS REAL compilado de la app, fuera del
 * cascarón de navegación. Eso alcanza para lo que la captura tiene que atrapar:
 * desbordes, jerarquía, contraste, texto cortado, y que cada cifra enseñe su
 * fuente. NO alcanza para el menú, el encabezado del proyecto ni la sesión — y eso
 * queda dicho en el reporte en vez de disimulado.
 *
 * Además de la imagen, mide lo que el ojo no cuenta bien: jerga de desarrollo,
 * UUID a la vista, colas de ceros de `numeric`, y que estén las cuatro tarjetas.
 */
import '../src/env';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { campaigns } from '../src/db/schema';
import { armarPantalla, auditarPantalla } from '../src/motor/pantalla';
import { fichaDe } from '../src/motor/ficha';
import { senalesVigentes, ultimaCorrida } from '../src/motor/radar';
import { publicosDe } from '../src/motor/publicos';
import { hipotesisSugerida, planDe } from '../src/motor/plan';
import { ORG_ZZ } from './zz-proyectos';

const SALIDA = path.resolve('capturas-c14');

const TAMANOS = [
  { nombre: '1440', width: 1440, height: 1200 },
  { nombre: 'movil', width: 390, height: 900 },
] as const;

/** Lo que NUNCA debe verse en una pantalla que se le enseña a un cliente. */
const JERGA_VISIBLE = [
  'undefined',
  '[object',
  'nan%',
  'internal server error',
  'traceback',
  'process.env',
  'jsonb',
  'uuid',
  'market_signals',
  'project_brief',
  'channel_plan',
  'numeric(',
];

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Las colas de ceros de `numeric(18,4)`: "28.6000%" en vez de "28.6%". */
const RE_CEROS = /\d+\.\d*0{3,}(?!\d)/g;

function cssCompilado(): string {
  // `readdirSync` y no `globSync`: globSync en `node:fs` llegó en Node 22 y aquí
  // corremos Node 20, así que ahí no existe y el catch se comía el error real.
  const dir = path.resolve('.next/static/chunks');
  let archivos: string[] = [];
  try {
    archivos = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f));
  } catch {
    archivos = [];
  }
  if (!archivos.length) {
    throw new Error('no hay CSS compilado. Corre primero: NODE_OPTIONS=--max-old-space-size=3072 npm run build');
  }
  return archivos.map((f) => readFileSync(f, 'utf8')).join('\n');
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });

  const [{ renderToStaticMarkup }, { default: React }, { PantallaEstrategia }, { webkit }] = await Promise.all([
    import('react-dom/server'),
    import('react'),
    import('../components/motor/estrategia'),
    import('playwright'),
  ]);

  const css = cssCompilado();
  const proyectos = await db.select().from(campaigns).where(eq(campaigns.orgId, ORG_ZZ));
  if (!proyectos.length) throw new Error('no hay proyectos zz-. Corre: npx tsx scripts/zz-proyectos.ts crear');

  const browser = await webkit.launch();
  const resultados: Array<Record<string, unknown>> = [];

  try {
    for (const p of proyectos) {
      const e = armarPantalla({
        proyecto: p,
        ficha: await fichaDe(p.orgId, p.id),
        senales: await senalesVigentes(p.orgId, p.id),
        corrida: await ultimaCorrida(p.orgId, p.id),
        publicos: await publicosDe(p.orgId, p.id),
        plan: await planDe(p.orgId, p.id),
        hipotesisDe: hipotesisSugerida,
      });

      const defectosProcedencia = auditarPantalla(e);
      const html = renderToStaticMarkup(React.createElement(PantallaEstrategia, { e }));

      const pagina = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin:0; padding:24px; }
  /* El encabezado que en la app pone ProjectHeader. Aquí se pinta a mano para que
     la captura se lea, y se dice que es un sustituto, no la app. */
  .qa-cabecera { margin-bottom:20px; }
  .qa-cabecera h1 { font-size:24px; margin:0 0 4px; }
  .qa-cabecera p { margin:0; opacity:.7; font-size:14px; }
  .qa-nota { margin-bottom:16px; padding:8px 12px; border-radius:8px;
             border:1px dashed currentColor; opacity:.55; font-size:12px; }
</style></head>
<body class="min-h-screen antialiased">
  <div style="max-width:1100px;margin:0 auto">
    <div class="qa-nota">Captura de QA · el componente real con datos reales de la base de desarrollo, sin el menú ni la sesión (no hay llaves de Clerk en dev).</div>
    <div class="qa-cabecera">
      <h1>${escapar(p.name)} — Estrategia</h1>
      <p>Qué vende este negocio, qué dice el mercado medido, a quién le hablamos y qué vamos a publicar. Cada número trae de dónde salió.</p>
    </div>
    ${html}
  </div>
</body></html>`;

      for (const t of TAMANOS) {
        const context = await browser.newContext({
          viewport: { width: t.width, height: t.height },
          deviceScaleFactor: 2,
          locale: 'es-MX',
        });
        const page = await context.newPage();
        await page.setContent(pagina, { waitUntil: 'load' });
        await page.waitForTimeout(400);

        const visible = await page.evaluate(() => document.body.innerText ?? '');
        const bajo = visible.toLowerCase();
        const jerga = JERGA_VISIBLE.filter((j) => bajo.includes(j));
        const uuids = visible.match(RE_UUID) ?? [];
        const ceros = visible.match(RE_CEROS) ?? [];

        const debe: Array<[string, RegExp]> = [
          ['tarjeta del negocio', /El negocio/i],
          ['tarjeta del mercado', /El mercado, medido/i],
          ['tarjeta de públicos', /A quién le hablamos/i],
          ['tarjeta del plan', /Qué se publica, dónde y para qué/i],
          ['la hipótesis de cada publicación', /La apuesta/i],
          ['el porqué de la métrica', /Por qué esa métrica/i],
        ];
        const faltantes = debe.filter(([, re]) => !re.test(visible)).map(([q]) => q);

        // Desborde horizontal: lo que en la captura se ve como texto cortado.
        const desborde = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );

        const archivo = path.join(SALIDA, `estrategia-${p.slug}-${t.nombre}.png`);
        await page.screenshot({ path: archivo, fullPage: true });

        const bien = !jerga.length && !uuids.length && !ceros.length && !faltantes.length && desborde <= 0 && !defectosProcedencia.length;
        console.log(
          `  ${bien ? '✓' : '✗'} ${p.slug} · ${t.nombre} · ${jerga.length} jerga · ${uuids.length} UUID · ` +
            `${ceros.length} ceros feos · ${faltantes.length} faltantes · desborde ${desborde}px · ` +
            `${defectosProcedencia.length} números sin fuente`,
        );
        if (jerga.length) console.log(`      jerga: ${jerga.join(', ')}`);
        if (uuids.length) console.log(`      UUID: ${uuids.slice(0, 3).join(', ')}`);
        if (ceros.length) console.log(`      ceros: ${ceros.slice(0, 5).join(', ')}`);
        if (faltantes.length) console.log(`      falta: ${faltantes.join(' · ')}`);

        resultados.push({
          proyecto: p.slug,
          tamano: t.nombre,
          jerga,
          uuids: uuids.length,
          ceros,
          faltantes,
          desborde,
          numerosSinFuente: defectosProcedencia.length,
          afirmaciones: e.afirmaciones.length,
          archivo,
          alto: (await page.evaluate(() => document.body.scrollHeight)) as number,
        });

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(path.join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2));
  const malos = resultados.filter(
    (r) =>
      (r.jerga as string[]).length ||
      (r.uuids as number) > 0 ||
      (r.ceros as string[]).length ||
      (r.faltantes as string[]).length ||
      (r.desborde as number) > 0 ||
      (r.numerosSinFuente as number) > 0,
  );
  console.log('');
  console.log(`${resultados.length} capturas · ${malos.length} con defectos · carpeta ${SALIDA}`);
  if (malos.length) process.exit(1);
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
