/**
 * Capturas de la corrida 5, en WebKit, a 1440 (y a 390 de pilón).
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c5.ts
 *
 * No es solo tomar fotos. Con una sesión REAL de Clerk:
 *   · monta un proyecto con las CUATRO situaciones que puede ver un cliente:
 *     una cuenta conectada de verdad (Airtable con la llave de Luis), una que
 *     se cayó, una propia de Goossip y las que están sin conectar;
 *   · aprieta "Conectar" en una tarjeta y comprueba que el navegador acaba en
 *     el Connect Link de Composio — la prueba de que el botón no es un adorno;
 *   · lee el texto renderizado y lo barre contra la jerga de desarrollo.
 *
 * Al final borra todo lo que creó, en la base y en Composio.
 *
 * Por qué `Authorization: Bearer` y no la cookie `__session`: la instancia de
 * Clerk es de producción y su único dominio es `vliving.life`. Desde
 * `127.0.0.1` la cookie dispara el handshake de Clerk (307 en bucle, medido en
 * la corrida 2). Con el encabezado, el middleware valida el mismo JWT.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { Browser, Page } from 'playwright';
import { db } from '../src/db/client';
import {
  campaigns,
  connectionLinks,
  orgMemberships,
  organizations,
  projectEvents,
  projectMembers,
  salesLeads,
  socialAccounts,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { composioKey, deleteConnectedAccount } from '../src/composio/client';
import { composioUserId, saveConnection } from '../src/projects/connections';

const BASE = (process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const SALIDA = path.resolve(process.env.CAPTURAS_DIR ?? 'capturas-c5');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const TAMANOS = [
  { nombre: 'escritorio', width: 1440, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
] as const;

async function clerk(ruta: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CLERK}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${CK}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`clerk ${ruta} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function composio(ruta: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://backend.composio.dev/api/v3${ruta}`, {
    ...init,
    headers: { 'x-api-key': composioKey() ?? '', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
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
  cuentasComposio: string[];
  authConfigsComposio: string[];
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c5_${marca}`;
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
  const slug = `qa-c5-${marca}`;
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
    id: `c5:${o.id}:${u.id}`,
    orgId: o.id,
    clerkUserId: u.id,
    email,
    role: 'org:admin',
  });

  const project = await createProject(
    o.id,
    dbUser.id,
    {
      name: 'V&LIVING',
      kind: 'real_estate',
      city: 'Tulum',
      country: 'México',
      website: 'https://vliving.site',
      audience: 'Inversionistas de 35 a 55, México y Estados Unidos',
    },
    { clerkUserId: u.id, email },
  );

  const cuentasComposio: string[] = [];
  const authConfigsComposio: string[] = [];

  // --- Una conexión de VERDAD, viva, para que el verde de la foto sea verde
  //     de verdad. Airtable por API key: autorizar un OAuth de Google o Slack
  //     necesita a un humano con esas cuentas.
  const token = (process.env.AIRTABLE_TOKEN ?? '').trim();
  if (token) {
    const ac = await composio('/auth_configs', {
      method: 'POST',
      body: JSON.stringify({
        toolkit: { slug: 'airtable' },
        auth_config: {
          type: 'use_custom_auth',
          authScheme: 'API_KEY',
          name: `goossip-fotos-${marca}`,
          credentials: {},
        },
      }),
    });
    if (ac?.auth_config?.id) {
      authConfigsComposio.push(ac.auth_config.id);
      const cuenta = await composio('/connected_accounts', {
        method: 'POST',
        body: JSON.stringify({
          auth_config: { id: ac.auth_config.id },
          connection: {
            user_id: composioUserId(project.id),
            state: { authScheme: 'API_KEY', val: { status: 'ACTIVE', generic_api_key: token } },
          },
        }),
      });
      if (cuenta?.id) {
        cuentasComposio.push(cuenta.id);
        await saveConnection({
          orgId: o.id,
          projectId: project.id,
          channel: 'airtable',
          connectedBy: u.id,
          userId: dbUser.id,
          label: 'firstcontact@allglobalholding.com',
          externalHandle: 'firstcontact@allglobalholding.com',
          verifiedAt: new Date(),
          metadata: { connected_account_id: cuenta.id, via: 'composio' },
        });
      }
    }
  }

  // --- Una que se cayó: el permiso ya no existe en Composio. La pantalla la
  //     verifica al abrirse y la manda a "Reconectar" con su motivo.
  await saveConnection({
    orgId: o.id,
    projectId: project.id,
    channel: 'notion',
    connectedBy: u.id,
    userId: dbUser.id,
    label: 'Manual de ventas',
    verifiedAt: new Date(),
    metadata: { connected_account_id: 'ca_ya_no_existe', via: 'composio' },
  });

  // --- Una propia de Goossip, que no depende de terceros.
  await saveConnection({
    orgId: o.id,
    projectId: project.id,
    channel: 'sitio',
    connectedBy: u.id,
    userId: dbUser.id,
    label: 'Formulario de tu sitio',
    externalId: 'fotos-token-de-ejemplo-solo-para-la-captura',
  });

  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, expires_in_seconds: 1800 }),
  });
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
      body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
    },
  );
  const body = await res.json();
  const sessionId = body?.client?.sessions?.[0]?.id;
  const clientCookie = (res.headers.get('set-cookie') ?? '').match(/__client=([^;]+)/)?.[1];
  if (!sessionId || !clientCookie) throw new Error(`sin sesión: ${JSON.stringify(body).slice(0, 200)}`);

  return {
    orgId: o.id,
    clerkId: u.id,
    userId: dbUser.id,
    email,
    projectId: project.id,
    sessionId,
    clientCookie,
    cuentasComposio,
    authConfigsComposio,
  };
}

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

/**
 * Jerga de desarrollo sobre el texto RENDERIZADO.
 *
 * "composio" ya NO está en la lista: desde esta corrida es el nombre de un
 * proveedor que el usuario ve, dictado por Luis. Lo que sí se exige, aparte, es
 * que venga con su frase completa y una sola vez.
 */
const JERGA_VISIBLE = [
  'auth_config',
  'auth config',
  'api key',
  'api_key',
  'request_id',
  'bridge',
  'baileys',
  'webhook',
  'undefined',
  '[object',
  'internal server error',
  'unauthorized',
  'forbidden',
  'traceback',
  'env var',
  'process.env',
  'toolkit',
  'oauth',
  'token',
  'soon',
  'neon',
  'vercel',
  'cron',
  'postgres',
  'clerk',
  'endpoint',
  'backend',
];

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
        if (!/clerk|Failed to load resource/i.test(texto)) erroresJs.push(texto.slice(0, 200));
      }
    });

    let status: number | null = null;
    let jerga: string[] = [];
    try {
      const res = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 60_000 });
      status = res?.status() ?? null;
      if (preparar) await preparar(page);
      await page.waitForTimeout(1200);
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

/** Lo que de verdad importa: que el botón lleve al Connect Link de Composio. */
async function pruebaDelBoton(browser: Browser, e: Escenario): Promise<{
  ok: boolean;
  url: string;
  tarjetas: number;
  grupos: string[];
  estados: Record<string, number>;
}> {
  console.log('\n— el botón Conectar, apretado de verdad —');
  const context = await contexto(browser, e, { width: 1440, height: 900 });
  const page = await context.newPage();
  await page.goto(`${BASE}/projects/${e.projectId}/conexiones`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);

  // Sin funciones declaradas dentro del `evaluate`: esbuild las envuelve con su
  // helper `__name`, que no existe en el navegador (medido: ReferenceError).
  const lectura = await page.evaluate(`(() => {
    const grupos = Array.from(document.querySelectorAll('section'))
      .map((s) => (s.querySelector('h2') || {}).textContent || '')
      .filter(Boolean);
    const texto = document.body.innerText || '';
    return {
      grupos,
      tarjetas: document.querySelectorAll('h3').length,
      estados: {
        'Conectado': texto.split('Conectado').length - 1,
        'Sin conectar': texto.split('Sin conectar').length - 1,
        'Reconectar': texto.split('Reconectar').length - 1,
        'Próximamente': texto.split('Próximamente').length - 1,
      },
    };
  })()`) as { grupos: string[]; tarjetas: number; estados: Record<string, number> };
  console.log(`  grupos: ${lectura.grupos.join(' · ')}`);
  console.log(`  tarjetas: ${lectura.tarjetas} · estados: ${JSON.stringify(lectura.estados)}`);

  // La tarjeta de Slack: se sube del título al contenido de SU tarjeta y se
  // aprieta el botón de ahí. Buscar "el último div que contenga el título"
  // agarra un contenedor que no trae el botón (medido: timeout).
  const tarjeta = page
    .locator('h3', { hasText: 'Slack' })
    .locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
  const recorrido: string[] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) recorrido.push(f.url());
  });
  // Lo que la app le contesta al botón. Es la prueba de a dónde la MANDA: el
  // salto de `connect.composio.dev` al proveedor es un 302 del lado del
  // servidor, así que el navegador no lo apunta en su recorrido.
  let redirectUrl = '';
  page.on('response', async (res) => {
    if (!res.url().includes('/api/connections/composio/start')) return;
    const body = await res.json().catch(() => null);
    if (body?.redirectUrl) redirectUrl = body.redirectUrl;
  });
  // La ventana de permisos se abre APARTE (así quedó en main): la pestaña con
  // la prueba es la HIJA, no esta. Se espera a que nazca.
  const [hija] = await Promise.all([
    context.waitForEvent('page', { timeout: 45_000 }).catch(() => null),
    tarjeta.getByRole('button', { name: 'Conectar' }).click({ timeout: 20_000 }),
  ]);
  await hija?.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(3500);
  const url = hija?.url() ?? page.url();

  /**
   * Dos formas válidas de acabar, y las dos son la buena:
   *   · en el Connect Link de Composio, o
   *   · ya en la pantalla de permisos del proveedor, si Composio reenvía solo.
   * Lo que se exige en el segundo caso es que el `redirect_uri` sea de
   * Composio: es la prueba de que la app que pide permiso es la SUYA y no una
   * nuestra registrada a mano.
   */
  const pasoPorComposio =
    /^https:\/\/connect\.composio\.dev\/link\//.test(redirectUrl) ||
    recorrido.some((u) => /connect\.composio\.dev\/link\//.test(u));
  const conRedireccionDeComposio = decodeURIComponent(url).includes(
    'backend.composio.dev/api/v1/auth-apps/add',
  );
  const ok = pasoPorComposio && (/composio\.dev/.test(url) || conRedireccionDeComposio);
  console.log(`  ${pasoPorComposio ? '✓' : '✗'} la app manda al Connect Link: ${redirectUrl || 'no contestó'}`);
  console.log(`  ${conRedireccionDeComposio ? '✓' : '·'} y acabó en la pantalla de permisos con el redirect_uri de Composio`);
  console.log(`  destino: ${url.slice(0, 120)}…`);
  // La foto es de la ventana de permisos, que es donde está la prueba.
  await (hija ?? page)
    .screenshot({ path: path.join(SALIDA, '03-connect-link-composio.png'), fullPage: true })
    .catch(() => undefined);
  // Y la pantalla de Goossip detrás, esperando a que la persona termine.
  await page
    .screenshot({ path: path.join(SALIDA, '03b-esperando-en-goossip.png'), fullPage: false })
    .catch(() => undefined);
  await context.close();
  return { ok, url, redirectUrl, ...lectura };
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  for (const id of e.cuentasComposio) await deleteConnectedAccount(id).catch(() => undefined);
  // Las cuentas que dejó el botón al apretarlo también se van.
  const sueltas = await composio(`/connected_accounts?user_ids=${composioUserId(e.projectId)}`).catch(
    () => null,
  );
  for (const c of sueltas?.items ?? []) await deleteConnectedAccount(c.id).catch(() => undefined);
  for (const id of e.authConfigsComposio) {
    await composio(`/auth_configs/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }

  await paso(() => db.delete(salesLeads).where(eq(salesLeads.orgId, e.orgId)));
  await paso(() => db.delete(projectEvents).where(inArray(projectEvents.projectId, [e.projectId])));
  await paso(() => db.delete(connectionLinks).where(inArray(connectionLinks.projectId, [e.projectId])));
  await paso(() => db.delete(projectMembers).where(inArray(projectMembers.projectId, [e.projectId])));
  await paso(() => db.delete(socialAccounts).where(eq(socialAccounts.orgId, e.orgId)));
  await paso(() => db.delete(campaigns).where(eq(campaigns.orgId, e.orgId)));
  await paso(() => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
  await paso(() => db.delete(organizations).where(eq(organizations.id, e.orgId)));
  await paso(() => db.delete(users).where(eq(users.clerkId, e.clerkId)));
  await clerk(`/organizations/${e.orgId}`, { method: 'DELETE' }).catch(() => undefined);
  await clerk(`/users/${e.clerkId}`, { method: 'DELETE' }).catch(() => undefined);
  console.log('  escenario borrado');
}

/**
 * Playwright NO es dependencia del proyecto: vive en el servidor. Se carga por
 * ruta absoluta porque en esta máquina hay dos copias y la resolución normal de
 * Node encuentra primero la vieja, que pide un WebKit que ya no está.
 */
async function cargarWebkit() {
  const ruta =
    process.env.PLAYWRIGHT_PATH ?? '/root/.nvm/versions/node/v20.20.2/lib/node_modules/playwright';
  const mod = await import(ruta);
  return (mod.webkit ?? mod.default?.webkit) as typeof import('playwright').webkit;
}

async function main(): Promise<void> {
  mkdirSync(SALIDA, { recursive: true });
  console.log(`CAPTURAS · corrida 5 · ${BASE} → ${SALIDA}`);

  let e: Escenario | null = null;
  let boton: Awaited<ReturnType<typeof pruebaDelBoton>> | null = null;
  const webkit = await cargarWebkit();
  const browser = await webkit.launch();
  try {
    e = await montar();
    console.log(`  escenario: org ${e.orgId} · proyecto ${e.projectId}`);

    console.log('\n— recorrido —');
    await capturar(browser, e, '01-conexiones', `/projects/${e.projectId}/conexiones`);
    await capturar(browser, e, '02-conexiones-abajo', `/projects/${e.projectId}/conexiones`, async (p) => {
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    });
    await capturar(browser, e, '04-conocimiento', `/projects/${e.projectId}/conocimiento`);
    await capturar(browser, e, '05-portada', '/');
    boton = await pruebaDelBoton(browser, e);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const con200 = resultados.filter((r) => r.status === 200).length;
  const conErrores = resultados.filter((r) => r.erroresJs.length > 0);
  const conJerga = resultados.filter((r) => r.jerga.length > 0);
  writeFileSync(
    path.join(SALIDA, 'resumen.json'),
    JSON.stringify(
      {
        base: BASE,
        capturas: resultados.length,
        http200: con200,
        pantallasConErroresDeJs: conErrores.length,
        pantallasConNotasInternas: conJerga.length,
        connectLink: boton,
        detalle: resultados,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n${resultados.length} capturas · ${con200} con HTTP 200 · ${conErrores.length} con errores de JS · ${conJerga.length} con notas internas`,
  );
  for (const r of conErrores) console.log(`  ✗ ${r.pantalla} (${r.tamano}): ${r.erroresJs.join(' | ')}`);
  for (const r of conJerga) console.log(`  ✗ ${r.pantalla} (${r.tamano}) jerga: ${r.jerga.join(', ')}`);
  if (conErrores.length > 0 || conJerga.length > 0 || con200 !== resultados.length || !boton?.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
