/**
 * Capturas de la corrida 11 — Meta Ads con la app propia — en WebKit, a 1440 y
 * a 390.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c11.ts
 *
 * No es sacar fotos. Con una sesión REAL de Clerk monta un proyecto y lo lleva
 * por los TRES momentos de la conexión, que son los tres que hay que mirar:
 *
 *   1. la tarjeta de Meta Ads ofreciendo Conectar,
 *   2. el selector de cuentas publicitarias —el paso que no se puede adivinar—,
 *   3. la cuenta ya conectada y la sección "Anuncios de Meta" en Campañas.
 *
 * Los datos del paso 3 son REALES: la cuenta `act_2629053887531679` "V&LIVING
 * Ads" leída con el `META_USER_TOKEN` que ya vive en el entorno. Se guarda
 * cifrado en la fila del proyecto DE PRUEBA y se borra al final junto con todo
 * lo demás: no entra a ningún proyecto de verdad ni a ninguna variable de la
 * app. Sin ese token el guion sigue corriendo — se saltan los pasos que piden
 * lecturas contra Graph y lo dice.
 *
 * Y sí: esa cuenta hoy NO trae campañas ni gasto (medido, `{"data":[]}`). La
 * captura enseña eso, que es la verdad. Sembrar campañas de mentira para que la
 * foto se vea llena es exactamente lo que esta doctrina prohíbe.
 *
 * Al final borra todo lo que creó.
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
  salesLeads,
  socialAccounts,
  users,
} from '../src/db/schema';
import { seal } from '../lib/secret-box';
import { listAdAccounts } from '../lib/meta-ads';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c11');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const TAMANOS = [
  { nombre: '1440', width: 1440, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
] as const;

function tokenDeLuis(): string | null {
  const t = process.env.META_USER_TOKEN?.trim();
  return t && !t.startsWith('[') ? t : null;
}

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
  email: string;
  projectId: string;
  sessionId: string;
  clientCookie: string;
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c11_${marca}`;
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
  const slug = `qa-c11-${marca}`;
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

  const project = await createProject(o.id, dbUser!.id, {
    name: 'V&LIVING',
    kind: 'inmobiliaria',
    website: 'https://vliving.life',
    city: 'Ciudad de México',
    country: 'México',
  });

  // Dos leads de formulario de anuncio de Meta: son el DIVISOR del costo por
  // lead. Sin ellos la sección enseñaría un guion y no se vería el cruce.
  await db.insert(salesLeads).values(
    ['Prospecto de anuncio 1', 'Prospecto de anuncio 2'].map((nombre, i) => ({
      orgId: o.id,
      userId: dbUser!.id,
      campaignId: project.id,
      fullName: nombre,
      phone: `52155000000${i}`,
      source: 'meta_leadgen' as const,
      stage: 'nuevo' as const,
      createdAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
    })),
  );

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
    email,
    projectId: project.id,
    sessionId,
    clientCookie: cookie,
  };
}

/**
 * Deja la conexión EXACTAMENTE como la deja el callback de Facebook: con el
 * permiso guardado y las cuentas por elegir. Las cuentas son las que devuelve
 * Graph de verdad, no una lista escrita a mano.
 */
async function dejarAMedias(e: Escenario, token: string): Promise<number> {
  const cuentas = await listAdAccounts(token);
  await db
    .delete(socialAccounts)
    .where(eq(socialAccounts.campaignId, e.projectId));
  await db.insert(socialAccounts).values({
    orgId: e.orgId,
    campaignId: e.projectId,
    userId: e.userId,
    platform: 'metaads',
    status: 'disconnected',
    connectedBy: e.clerkId,
    metadata: {
      user_token: seal(token),
      candidates: cuentas.map((c) => ({
        id: c.id,
        accountId: c.accountId,
        name: c.name,
        business: c.business,
        currency: c.currency,
        status: c.status,
      })),
    },
  });
  return cuentas.length;
}

/** Y ahora como queda después de elegir cuenta: conectada y confirmada. */
async function dejarConectada(e: Escenario, token: string): Promise<string> {
  const cuentas = await listAdAccounts(token);
  const elegida = cuentas.find((c) => c.id === 'act_2629053887531679') ?? cuentas[0];
  if (!elegida) throw new Error('el token no lee ninguna cuenta publicitaria');
  await db
    .update(socialAccounts)
    .set({
      status: 'connected',
      label: elegida.name,
      externalHandle: elegida.name,
      externalId: elegida.id,
      connectedAt: new Date(),
      verifiedAt: new Date(),
      metadata: {
        user_token: seal(token),
        business: elegida.business,
        business_id: elegida.businessId,
        currency: elegida.currency,
        account_status: elegida.status,
        candidates: [],
      },
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.campaignId, e.projectId));
  return elegida.name;
}

// ---------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------

/** Jerga de desarrollo que el cliente NO debe leer en pantalla. */
const JERGA_VISIBLE = [
  'auth_config',
  'api key',
  'api_key',
  'access_token',
  'act_',
  'request_id',
  'undefined',
  '[object',
  'internal server error',
  'unauthorized',
  'forbidden',
  'traceback',
  'env var',
  'process.env',
  'oauth',
  'ads_read',
  'ads_management',
  'graph',
  'neon',
  'vercel',
  'postgres',
  'clerk',
  'endpoint',
  'backend',
];

/**
 * Espera a que la pantalla TERMINE de cargar.
 *
 * La pizarra de Conexiones reconcilia contra Composio antes de contestar y la
 * sección de Meta pide dos veces a Graph: en `dev` eso son varios segundos, y
 * una captura a los 1.5 s enseña "Cargando tus conexiones…" — que fue justo lo
 * que salió en la primera pasada de este guion.
 */
async function esperarListo(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !/Cargando tus (conexiones|anuncios)/i.test(document.body.innerText ?? ''),
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => undefined);
}

interface Resultado {
  pantalla: string;
  ruta: string;
  tamano: string;
  status: number | null;
  erroresJs: string[];
  jerga: string[];
  archivo: string;
}
const resultados: Resultado[] = [];

/** Clerk emite el JWT con 60 s de vida: se pide uno fresco por pantalla. */
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

async function contexto(browser: Browser, e: Escenario, t: { width: number; height: number }) {
  const token = await jwt(e);
  return browser.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

async function capturar(
  browser: Browser,
  e: Escenario,
  pantalla: string,
  ruta: string,
  preparar?: (page: Page) => Promise<void>,
): Promise<void> {
  for (const t of TAMANOS) {
    const context = await contexto(browser, e, t);
    const page = await context.newPage();
    const erroresJs: string[] = [];
    page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const texto = msg.text();
        // El socket de recarga en caliente del `dev` no es un error de la app:
        // no existe en producción y ensucia la medición.
        if (!/clerk|Failed to load resource|webpack-hmr/i.test(texto)) {
          erroresJs.push(texto.slice(0, 200));
        }
      }
    });

    let status: number | null = null;
    let jerga: string[] = [];
    try {
      const res = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 90_000 });
      status = res?.status() ?? null;
      await esperarListo(page);
      if (preparar) await preparar(page);
      await page.waitForTimeout(1500);
      const visible = await page.evaluate(() => document.body.innerText ?? '');
      const t2 = visible.toLowerCase();
      jerga = JERGA_VISIBLE.filter((j) => t2.includes(j));
    } catch (err) {
      erroresJs.push(`navegación: ${(err as Error).message.slice(0, 160)}`);
    }

    const archivo = path.join(SALIDA, `${pantalla}-${t.nombre}.png`);
    await page.screenshot({ path: archivo, fullPage: true }).catch(() => undefined);
    resultados.push({ pantalla, ruta, tamano: t.nombre, status, erroresJs, jerga, archivo });
    console.log(
      `  ${status === 200 && erroresJs.length === 0 && jerga.length === 0 ? '✓' : '✗'} ${pantalla} · ${t.nombre} · HTTP ${status ?? '?'} · ${erroresJs.length} errores de JS · ${jerga.length} notas internas${jerga.length ? ` (${jerga.join(', ')})` : ''}`,
    );
    await context.close();
  }
}

/**
 * Lo que el ojo no alcanza a contar: que la tarjeta EXISTA con su botón, que el
 * selector enseñe la cuenta real y que la sección de Campañas traiga el nombre
 * de la cuenta conectada.
 */
async function medir(browser: Browser, e: Escenario, conToken: boolean) {
  console.log('\n— lo que se mide, no se mira —');
  const context = await contexto(browser, e, { width: 1440, height: 900 });
  const page = await context.newPage();

  await page.goto(`${BASE}/projects/${e.projectId}/conexiones`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });
  await esperarListo(page);
  await page.waitForTimeout(2000);
  const texto = await page.evaluate(() => document.body.innerText ?? '');
  const tarjeta = /Meta Ads/.test(texto);
  const proximamente = /Meta Ads[\s\S]{0,400}?Próximamente/.test(texto);
  const soloLectura = /solo lectura/i.test(texto);
  console.log(`  ${tarjeta ? '✓' : '✗'} la tarjeta "Meta Ads" está en Conexiones`);
  console.log(`  ${proximamente ? '✗' : '✓'} y ya NO dice "Próximamente"`);
  console.log(`  ${soloLectura ? '✓' : '✗'} avisa que Goossip solo lee`);

  let campanas = { seccion: false, cuenta: false, cpl: false };
  if (conToken) {
    await page.goto(`${BASE}/projects/${e.projectId}/campanas`, {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });
    await esperarListo(page);
    await page.waitForTimeout(3000);
    const t2 = await page.evaluate(() => document.body.innerText ?? '');
    campanas = {
      seccion: /Anuncios de Meta/.test(t2),
      cuenta: /V&LIVING Ads/i.test(t2),
      cpl: /Costo por lead/i.test(t2),
    };
    console.log(`  ${campanas.seccion ? '✓' : '✗'} Campañas trae la sección "Anuncios de Meta"`);
    console.log(`  ${campanas.cuenta ? '✓' : '✗'} con el nombre real de la cuenta conectada`);
    console.log(`  ${campanas.cpl ? '✓' : '✗'} y el costo por lead`);
  }

  await context.close();
  return { tarjeta, proximamente, soloLectura, campanas };
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  // La fila de `social_accounts` lleva el token del cliente cifrado: es lo
  // PRIMERO que se va.
  await paso(() => db.delete(socialAccounts).where(eq(socialAccounts.campaignId, e.projectId)));
  await paso(() => db.delete(salesLeads).where(eq(salesLeads.campaignId, e.projectId)));
  await paso(() => db.delete(projectMembers).where(eq(projectMembers.projectId, e.projectId)));
  await paso(() => db.delete(campaigns).where(eq(campaigns.id, e.projectId)));
  await paso(() => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
  await paso(() => db.delete(organizations).where(eq(organizations.id, e.orgId)));
  await paso(() => db.delete(users).where(inArray(users.id, [e.userId])));
  await paso(() => clerk(`/organizations/${e.orgId}`, { method: 'DELETE' }));
  await paso(() => clerk(`/users/${e.clerkId}`, { method: 'DELETE' }));

  const quedan = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(eq(socialAccounts.campaignId, e.projectId));
  console.log(`  ${quedan.length === 0 ? '✓' : '✗'} no quedó ningún permiso guardado de la prueba`);
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  if (!CK) throw new Error('CLERK_SECRET_KEY no está en el entorno.');

  const token = tokenDeLuis();
  if (!token) {
    console.log('(sin META_USER_TOKEN: solo se captura la tarjeta sin conectar)\n');
  }

  const { webkit } = await import(
    '/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never
  );
  const browser = await webkit.launch();
  let e: Escenario | null = null;
  let medidas: Awaited<ReturnType<typeof medir>> | null = null;
  let cuantasCuentas = 0;
  let nombreCuenta: string | null = null;

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}\n`);
    console.log('— capturas —');

    // 1. La tarjeta, sin nada conectado. Es lo que ve un cliente nuevo.
    await capturar(browser, e, '01-conexiones-tarjeta-meta-ads', `/projects/${e.projectId}/conexiones`);

    if (token) {
      // 2. El selector de cuentas: se deja la conexión como la deja el callback
      //    y se aprieta "Elegir cuenta", que es lo que hace el usuario.
      cuantasCuentas = await dejarAMedias(e, token);
      await capturar(
        browser,
        e,
        '02-selector-de-cuentas',
        `/projects/${e.projectId}/conexiones`,
        async (page) => {
          await page
            .getByRole('button', { name: /Elegir cuenta/i })
            .first()
            .click({ timeout: 15_000 })
            .catch(() => undefined);
          await page.waitForTimeout(1200);
        },
      );

      // 3. Conectada y confirmada.
      nombreCuenta = await dejarConectada(e, token);
      await capturar(browser, e, '03-conexiones-conectado', `/projects/${e.projectId}/conexiones`);

      // 4. La sección de Campañas, con los números que devuelve Meta hoy.
      await capturar(browser, e, '04-campanas-anuncios-de-meta', `/projects/${e.projectId}/campanas`);
    }

    medidas = await medir(browser, e, Boolean(token));
  } catch (err) {
    console.error('\n✗ explotó:', err);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const resumen = {
    corrida: 'c11',
    base: BASE,
    conTokenDeMeta: Boolean(token),
    cuentasQueLeeElToken: cuantasCuentas,
    cuentaConectada: nombreCuenta,
    capturas: resultados.length,
    http200: resultados.filter((r) => r.status === 200).length,
    erroresJs: resultados.reduce((n, r) => n + r.erroresJs.length, 0),
    notasInternas: resultados.reduce((n, r) => n + r.jerga.length, 0),
    medidas,
    detalle: resultados,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));

  console.log(
    `\n${resumen.capturas} capturas · ${resumen.http200} con HTTP 200 · ${resumen.erroresJs} errores de JS · ${resumen.notasInternas} notas internas`,
  );
  console.log(`resumen en ${path.join(SALIDA, 'resumen.json')}`);
  process.exit(resumen.erroresJs > 0 || resumen.notasInternas > 0 ? 1 : 0);
}

void main();
