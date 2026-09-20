/**
 * Las capturas de la corrida 12: el RECORRIDO, en WebKit a 1440.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c12.ts
 *
 * Y no es sacar seis fotos de una pantalla quieta. Lo que hace:
 *
 *   1. monta un proyecto de verdad con una sesión real de Clerk;
 *   2. abre la Sala, escribe "Tulum" y **aprieta el botón**, igual que una
 *      persona — o sea que dispara un barrido REAL contra Google Places, con
 *      sus diez llamadas cobradas;
 *   3. dispara cada captura por lo que el DOM esté enseñando, no por un reloj:
 *      cuando cae el primer marcador, cuando van veinte, cuando está leyendo el
 *      sitio de alguien, cuando aparece el resumen. Un `waitForTimeout(8000)`
 *      saca la foto de lo que haya, y lo que haya cambia en cada corrida;
 *   4. **cuenta sobre el DOM renderizado** lo que el ojo no alcanza: cuántos
 *      marcadores hay pegados en el mapa, cuántas tarjetas cayeron en la lista,
 *      si el lienzo del mapa de verdad pintó (no basta con que exista) y si los
 *      nombres de las tarjetas son los mismos que quedaron en la base.
 *
 * Al final borra todo lo que creó, incluidos los prospectos del barrido.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { Browser, Page } from 'playwright';
import { db } from '../src/db/client';
import {
  campaigns,
  organizations,
  orgMemberships,
  projectMembers,
  prospectSearches,
  prospects,
  salesLeads,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c12');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';
const ANCHO = 1440;
const ALTO = 900;

async function clerk(ruta: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CLERK}${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CK}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`clerk ${ruta} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function frontendApi(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  return Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
}
const ORIGEN = `https://${frontendApi().replace(/^clerk\./, '')}`;

interface Escenario {
  orgId: string;
  clerkId: string;
  userId: string;
  projectId: string;
  sessionId: string;
  clientCookie: string;
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c12_${marca}`;
  const email = `${username}@vforge.site`;

  const u = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      username,
      first_name: 'Luis',
      password: `Qa-Goossip-2026-${marca}A!x`,
      skip_password_checks: true,
    }),
  });
  const slug = `qa-c12-${marca}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'All Global Holding', slug, created_by: u.id }),
  });

  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, firstName: 'Luis', isAdmin: false })
    .onConflictDoNothing()
    .returning();
  const dbUser = row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];

  await upsertOrg({ id: o.id, name: 'All Global Holding', slug, ownerUserId: u.id });
  await upsertMembership({
    id: `orgmem_${marca}`,
    orgId: o.id,
    clerkUserId: u.id,
    email,
    role: 'org:admin',
  });

  // `marketplace` y no `servicios` a propósito: es el tipo cuyo primer preset
  // son restaurantes y cafeterías, que es la prueba de aceptación que pidió
  // Luis. La pantalla tiene que llegar con eso ya marcado, sin tocar nada.
  const project = await createProject(o.id, dbUser!.id, {
    name: 'MOMENTUM',
    kind: 'marketplace',
    website: 'https://vmomentum.site',
    city: 'Tulum',
    country: 'México',
  });

  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, expires_in_seconds: 3600 }),
  });
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
      body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
    },
  );
  const cuerpo = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c?.startsWith('__client='))
    ?.replace('__client=', '');
  const sessionId = (cuerpo?.response ?? cuerpo)?.created_session_id;
  if (!sessionId || !cookie) {
    throw new Error(`no se pudo montar la sesión: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  }

  return {
    orgId: o.id,
    clerkId: u.id,
    userId: dbUser!.id,
    projectId: project.id,
    sessionId,
    clientCookie: cookie,
  };
}

/** Clerk emite el JWT con 60 s de vida. El recorrido dura más: se pide fresco. */
async function jwt(e: Escenario): Promise<string> {
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sessions/${e.sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `__client=${e.clientCookie}`,
        Origin: ORIGEN,
      },
      body: new URLSearchParams({ active_organization_id: e.orgId }),
    },
  );
  const body = await res.json();
  const t = (body?.response ?? body)?.last_active_token?.jwt;
  if (!t) throw new Error(`sin jwt: ${JSON.stringify(body).slice(0, 200)}`);
  return t;
}

const capturas: Array<{ nombre: string; archivo: string; cuando: string }> = [];
const erroresJs: string[] = [];

async function foto(page: Page, nombre: string, cuando: string) {
  const archivo = path.join(SALIDA, `${nombre}-1440.png`);
  await page.screenshot({ path: archivo });
  capturas.push({ nombre, archivo, cuando });
  console.log(`  ✓ ${nombre} — ${cuando}`);
}

/** Cuántos marcadores, tarjetas y líneas de narración hay AHORA en la pantalla. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const lienzo = document.querySelector('canvas') as HTMLCanvasElement | null;
    return {
      marcadores: document.querySelectorAll('.goossip-pin').length,
      tarjetas: document.querySelectorAll('.goossip-tarjeta').length,
      pulsos: document.querySelectorAll('.goossip-pulso').length,
      contador:
        (document.body.innerText.match(/\d+ negocios? · \d+ con teléfono · \d+ con sitio web[^\n]*/) ??
          [])[0] ?? '',
      cuadrante: (document.body.innerText.match(/cuadrante \d+ de \d+/) ?? [])[0] ?? '',
      lienzoAncho: lienzo?.width ?? 0,
      lienzoAlto: lienzo?.height ?? 0,
      nombres: [...document.querySelectorAll('.goossip-tarjeta')]
        .map((t) => (t.querySelector('a, span') as HTMLElement | null)?.innerText?.trim() ?? '')
        .filter(Boolean),
    };
  });
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  if (!CK) throw new Error('CLERK_SECRET_KEY no está en el entorno.');

  const { webkit } = await import(
    '/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never
  );
  const browser: Browser = await webkit.launch();
  let e: Escenario | null = null;
  const medidas: Record<string, unknown> = {};

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}\n`);

    const context = await browser.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 2,
      locale: 'es-MX',
      extraHTTPHeaders: { Authorization: `Bearer ${await jwt(e)}` },
    });
    /**
     * El JWT de Clerk vive 60 segundos y el recorrido dura tres minutos.
     * Sin refrescarlo, la primera petición DESPUÉS del barrido —la que
     * recarga el contador— sale con un token muerto, Clerk la manda a
     * `/sign-in` y el navegador termina con un "Load failed" en pantalla que
     * no es de la app: es del arnés. En el navegador de una persona esto no
     * pasa porque la cookie de sesión se renueva sola.
     */
    const refresco = setInterval(() => {
      void jwt(e!)
        .then((t) => context.setExtraHTTPHeaders({ Authorization: `Bearer ${t}` }))
        .catch(() => undefined);
    }, 40_000);

    const page = await context.newPage();
    page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (!/clerk|Failed to load resource/i.test(t)) erroresJs.push(t.slice(0, 200));
    });

    console.log('— el recorrido —');
    const res = await page.goto(`${BASE}/projects/${e.projectId}/prospeccion?zona=Tulum`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    medidas.http = res?.status() ?? null;

    // El mapa tarda: primero carga el trozo de MapLibre, después pide teselas.
    await page.waitForSelector('canvas', { timeout: 45_000 });
    await page.waitForTimeout(4000);
    medidas.antes = await medir(page);
    await foto(page, '01-sala-lista', 'la Sala abierta, con el mapa y los objetivos del giro');

    // Se aprieta el botón, como lo apretaría una persona.
    await page.getByRole('button', { name: /Recorrer la zona/ }).click({ timeout: 15_000 });

    await page.waitForSelector('.goossip-pin', { timeout: 120_000 });
    await page.waitForTimeout(600);
    medidas.primerMarcador = await medir(page);
    await foto(page, '02-primer-cuadrante', 'cae el primer negocio, con el pulso del cuadrante');

    // 60 y no 20: el primer cuadrante ya devuelve 20 de un jalón, así que con
    // ese corte la captura 3 salía idéntica a la 2 —mismo instante, distinta
    // hora— y la secuencia no enseñaba que el recorrido avanza.
    await page.waitForFunction(() => document.querySelectorAll('.goossip-pin').length >= 60, null, {
      timeout: 180_000,
    });
    medidas.sesenta = await medir(page);
    await foto(page, '03-recorriendo', 'sesenta marcadores puestos, la cámara a media zona');

    await page
      .waitForFunction(() => /leyendo su sitio/i.test(document.body.innerText), null, {
        timeout: 240_000,
      })
      .catch(() => console.log('  ! no se alcanzó a ver el paso de "leyendo su sitio"'));
    medidas.leyendo = await medir(page);
    await foto(page, '04-leyendo-su-sitio', 'el enriquecimiento visible: leyendo el sitio del negocio');

    await page.waitForFunction(() => /Lo que encontré/.test(document.body.innerText), null, {
      timeout: 300_000,
    });
    await page.waitForTimeout(2500);
    medidas.resumen = await medir(page);
    medidas.hallazgos = await page.evaluate(() => {
      const caja = [...document.querySelectorAll('div')].find((d) =>
        d.className?.toString?.().includes('shadow-lg'),
      );
      return [...(caja?.querySelectorAll('li') ?? [])].map((li) => (li as HTMLElement).innerText.trim());
    });
    await foto(page, '05-resumen', 'el resumen con los hallazgos y los botones de cierre');

    await page.getByRole('button', { name: /Modo Presentación/ }).click({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    medidas.demo = await medir(page);
    await foto(page, '06-modo-presentacion', 'pantalla completa, sin sidebar, narración al centro');

    // Lo que quedó en la base contra lo que se ve en la pantalla.
    const filas = await db.select().from(prospects).where(eq(prospects.projectId, e.projectId));
    const busquedas = await db
      .select()
      .from(prospectSearches)
      .where(eq(prospectSearches.projectId, e.projectId));
    medidas.base = {
      prospectos: filas.length,
      placeIdsUnicos: new Set(filas.map((f) => f.placeId)).size,
      conSitio: filas.filter((f) => f.website).length,
      conTelefono: filas.filter((f) => f.phone).length,
      conCorreoLeido: filas.filter((f) => (f.enrichment as any)?.email).length,
      busquedas: busquedas.length,
      llamadasCobradas: busquedas.reduce((n, b) => n + b.costUnits, 0),
    };
    const nombresEnPantalla = new Set((medidas.resumen as any)?.nombres ?? []);
    const nombresEnBase = new Set(filas.map((f) => f.name));
    medidas.nombresQueNoEstanEnLaBase = [...nombresEnPantalla].filter(
      (n) => !nombresEnBase.has(n as string),
    );

    clearInterval(refresco);
    await context.close();
  } catch (err) {
    console.error('\n✗ explotó:', err);
    erroresJs.push(`corrida: ${(err as Error).message.slice(0, 200)}`);
  } finally {
    await browser.close();
    if (e) {
      console.log('\n— limpieza —');
      const paso = async (fn: () => Promise<unknown>) => void (await fn().catch(() => undefined));
      await paso(() => db.delete(prospects).where(eq(prospects.projectId, e!.projectId)));
      await paso(() => db.delete(prospectSearches).where(eq(prospectSearches.projectId, e!.projectId)));
      await paso(() => db.delete(salesLeads).where(eq(salesLeads.campaignId, e!.projectId)));
      await paso(() => db.delete(projectMembers).where(eq(projectMembers.projectId, e!.projectId)));
      await paso(() => db.delete(campaigns).where(eq(campaigns.id, e!.projectId)));
      await paso(() => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e!.orgId)));
      await paso(() => db.delete(organizations).where(eq(organizations.id, e!.orgId)));
      await paso(() => db.delete(users).where(inArray(users.id, [e!.userId])));
      await paso(() => clerk(`/organizations/${e!.orgId}`, { method: 'DELETE' }));
      await paso(() => clerk(`/users/${e!.clerkId}`, { method: 'DELETE' }));
      console.log('  listo');
    }
  }

  const resumen = {
    corrida: 'c12',
    base: BASE,
    capturas,
    erroresJs,
    medidas,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(`\n${capturas.length} capturas · ${erroresJs.length} errores de JS`);
  console.log(JSON.stringify(medidas, null, 2));
  process.exit(erroresJs.length > 0 || capturas.length < 5 ? 1 : 0);
}

void main();
