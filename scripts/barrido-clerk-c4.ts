/**
 * Barrido C del issue: cero textos en inglés de Clerk a la vista, y si el plan
 * deja quitar el "Secured by Clerk".
 *
 *   npx tsx scripts/barrido-clerk-c4.ts
 *
 * Se mide en DOS lados, y son distintos a propósito:
 *
 *   · en `127.0.0.1`, donde corre lo de esta corrida — pero ahí los widgets de
 *     Clerk NO montan (medido en la corrida 2: su único dominio es
 *     vliving.life), así que lo que se comprueba es que no haya inglés NUESTRO;
 *   · en `https://vliving.life`, producción, donde los widgets sí montan y se
 *     puede leer de verdad en qué idioma habla Clerk.
 *
 * Y se vuelve a preguntar a la Backend API por el branding, en vez de copiar la
 * conclusión de la corrida 3.
 */
import '../src/env';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const LOCAL = (process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const PROD = (process.env.GOOSSIP_PROD_URL ?? 'https://vliving.life').replace(/\/$/, '');
const SALIDA = path.resolve(process.env.CAPTURAS_DIR ?? 'capturas-c4');
const CK = process.env.CLERK_SECRET_KEY ?? '';

/** Lo que enseña Clerk cuando la localización no prendió. */
const INGLES = [
  // "secured by", a secas: en la pantalla real la palabra "Clerk" NO es texto,
  // es un logo en SVG. Buscando "secured by clerk" el barrido contestaba que no
  // había nada y la captura enseñaba el sello abajo del formulario. Medido el
  // 16-sep en producción.
  'secured by',
  'sign in',
  'sign up',
  'sign out',
  'continue',
  'email address',
  'password',
  'forgot password',
  'manage account',
  'manage organization',
  'create organization',
  'personal account',
  'no account',
  'welcome back',
  'don’t have an account',
  "don't have an account",
];

function ingles(texto: string): string[] {
  const t = texto.toLowerCase();
  return INGLES.filter((p) => t.includes(p));
}

async function cargarWebkit() {
  const ruta =
    process.env.PLAYWRIGHT_PATH ?? '/root/.nvm/versions/node/v20.20.2/lib/node_modules/playwright';
  const mod = await import(ruta);
  return (mod.webkit ?? mod.default?.webkit) as typeof import('playwright').webkit;
}

interface Medida {
  url: string;
  status: number | null;
  /** Cuántos nodos pintó Clerk. Cero = el widget no montó y no hay qué leer. */
  nodosDeClerk: number;
  montoElWidget: boolean;
  ingles: string[];
  secured: boolean;
  /** Una muestra del texto, para poder MIRARLO y no solo creerle al contador. */
  muestra: string;
}

async function medir(page: import('playwright').Page, url: string): Promise<Medida> {
  let status: number | null = null;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    status = res?.status() ?? null;
  } catch {
    /* se reporta abajo con status null */
  }
  // A los widgets de Clerk hay que darles tiempo: montan después del primer
  // pintado. Sin esta espera, "0 nodos" no significaría nada.
  await page.waitForTimeout(3500);

  const datos = await page.evaluate(() => {
    const clerk = document.querySelectorAll('[class*="cl-"]');
    return {
      nodosDeClerk: clerk.length,
      montoElWidget: Boolean(
        document.querySelector('.cl-signIn-root, .cl-userButtonTrigger, .cl-organizationSwitcherTrigger'),
      ),
      texto: document.body.innerText ?? '',
    };
  });

  return {
    url,
    status,
    nodosDeClerk: datos.nodosDeClerk,
    montoElWidget: datos.montoElWidget,
    ingles: ingles(datos.texto),
    secured: /secured by/i.test(datos.texto),
    muestra: datos.texto.replace(/\s+/g, ' ').trim().slice(0, 400),
  };
}

async function branding(): Promise<Record<string, unknown>> {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const fapi = Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
  const entorno = () =>
    fetch(`https://${fapi}/v1/environment?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`)
      .then((r) => r.json())
      .catch(() => null);

  const antes = await entorno();
  const intentos: Array<{ campo: string; status: number }> = [];
  for (const campo of ['branded', 'clerk_branding', 'show_clerk_branding']) {
    const r = await fetch('https://api.clerk.com/v1/instance', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${CK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: false }),
    });
    intentos.push({ campo, status: r.status });
  }
  const despues = await entorno();

  return {
    brandedAntes: antes?.display_config?.branded,
    intentos,
    brandedDespues: despues?.display_config?.branded,
    sePudoQuitar: despues?.display_config?.branded === false,
  };
}

async function main(): Promise<void> {
  mkdirSync(SALIDA, { recursive: true });
  console.log('BARRIDO C · inglés de Clerk y "Secured by Clerk"');

  console.log('\n— el branding, preguntado otra vez a la Backend API —');
  const marca = await branding();
  console.log(
    `  branded antes=${marca.brandedAntes} · PATCH ${(marca.intentos as Array<{ status: number }>).map((i) => i.status).join('/')} · branded después=${marca.brandedDespues} → ${marca.sePudoQuitar ? 'SE PUDO QUITAR' : 'NO se puede desde código en este plan'}`,
  );

  const webkit = await cargarWebkit();
  const browser = await webkit.launch();
  const medidas: Medida[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' });
    const page = await context.newPage();

    console.log('\n— producción, donde los widgets SÍ montan —');
    for (const ruta of ['/sign-in', '/sign-up']) {
      const m = await medir(page, `${PROD}${ruta}`);
      medidas.push(m);
      await page.screenshot({
        path: path.join(SALIDA, `clerk-prod-${ruta.replace(/\//g, '')}.png`),
      });
      console.log(
        `  ${m.url} → HTTP ${m.status} · ${m.nodosDeClerk} nodos de Clerk · widget montado=${m.montoElWidget} · "Secured by Clerk"=${m.secured} · ${m.ingles.length} en inglés${m.ingles.length ? ` (${m.ingles.join(', ')})` : ''}`,
      );
      console.log(`    texto: ${m.muestra.slice(0, 220)}`);
    }

    console.log('\n— local, donde corre lo de esta corrida —');
    for (const ruta of ['/sign-in', '/']) {
      const m = await medir(page, `${LOCAL}${ruta}`);
      medidas.push(m);
      console.log(
        `  ${m.url} → HTTP ${m.status} · ${m.nodosDeClerk} nodos de Clerk · widget montado=${m.montoElWidget} · ${m.ingles.length} en inglés${m.ingles.length ? ` (${m.ingles.join(', ')})` : ''}`,
      );
    }

    await context.close();
  } finally {
    await browser.close();
  }

  writeFileSync(
    path.join(SALIDA, 'barrido-clerk.json'),
    JSON.stringify({ branding: marca, medidas }, null, 2),
  );

  const conIngles = medidas.filter((m) => m.ingles.length > 0 && !m.secured);
  console.log(
    `\n${medidas.length} pantallas medidas · ${medidas.filter((m) => m.montoElWidget).length} con widget de Clerk montado · ${conIngles.length} con inglés que NO sea el sello de Clerk`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
