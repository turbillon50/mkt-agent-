/**
 * Capturas de la corrida 3, en WebKit, a 390 y a 1440.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 \
 *   NODE_PATH=/root/node_modules npx tsx scripts/capturas-c3.ts
 *
 * Monta un escenario de verdad (org, usuario, proyecto, equipo, enlace de
 * conexión), recorre la app con una sesión REAL y guarda una foto de cada
 * pantalla en los dos tamaños. Al final borra todo lo que creó.
 *
 * Por qué `Authorization: Bearer` y no la cookie `__session`: la instancia de
 * Clerk es de producción y su único dominio es `vliving.life`. Desde
 * `127.0.0.1` la cookie dispara el handshake de Clerk (307 en bucle, medido en
 * la corrida 2) y no se vería ni una pantalla. Con el encabezado, el middleware
 * valida el mismo JWT y la app se pinta igual que en producción. Playwright lo
 * pone en el contexto, así que viaja también en los `fetch` del navegador.
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
import { ingestLead } from '../src/sales/ingest';
import { createConnectionLink } from '../src/projects/links';
import { upsertProjectMember } from '../src/projects/members';
import { saveConnection } from '../src/projects/connections';

const BASE = (process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const SALIDA = path.resolve(process.env.CAPTURAS_DIR ?? 'capturas-c3');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const TAMANOS = [
  { nombre: 'movil', width: 390, height: 844 },
  { nombre: 'escritorio', width: 1440, height: 900 },
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

function frontendApi(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  return Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
}
const ORIGEN = `https://${frontendApi().replace(/^clerk\./, '')}`;

// ---------------------------------------------------------------------------

interface Escenario {
  orgId: string;
  clerkId: string;
  userId: string;
  email: string;
  projectId: string;
  tokenEnlace: string;
  sessionId: string;
  clientCookie: string;
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_shot_${marca}`;
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
  const slug = `qa-fotos-${marca}`;
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
    id: `shot:${o.id}:${u.id}`,
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
      sellerPersona:
        'Te llamas Sofía. Hablas claro y directo, de tú. Vendes para V&LIVING. Nunca prometes descuentos ni fechas de entrega. Atiendes de lunes a viernes de 9 a 19.',
      rules: {
        business_hours: 'lunes a viernes de 9 a 19, sábado de 10 a 14',
        escalate_to: 'Luis · +52 1 998 000 0000',
        never_promises: 'descuentos, fechas de entrega, rendimientos garantizados',
        owner_phone: '+5219980000000',
      },
    },
    { clerkUserId: u.id, email },
  );

  // Escenario con algo adentro: un panel vacío no enseña si el panel sirve.
  await saveConnection({
    orgId: o.id,
    projectId: project.id,
    channel: 'meta',
    connectedBy: email,
    userId: dbUser.id,
    label: 'V&living',
    externalId: '1173019489236259',
    metadata: {
      page_id: '1173019489236259',
      page_name: 'V&living',
      forms: [{ id: '2146578942620117', name: 'All living' }],
      available_forms: [
        { id: '2146578942620117', name: 'All living', status: 'ACTIVE', leadsCount: 26 },
      ],
      suscrita: true,
    },
  });
  await saveConnection({
    orgId: o.id,
    projectId: project.id,
    channel: 'sitio',
    connectedBy: email,
    userId: dbUser.id,
    label: 'Formulario de tu sitio',
    externalId: 'fotos-token-de-ejemplo-solo-para-la-captura',
  });

  await upsertProjectMember({
    orgId: o.id,
    projectId: project.id,
    email: 'community@cliente.com',
    role: 'conector',
    status: 'invitado',
    invitedBy: u.id,
  });

  for (const [i, nombre] of ['Ana Ramírez', 'Jorge Peña', 'Marisol Cruz'].entries()) {
    await ingestLead({
      project,
      fullName: nombre,
      phone: `+52155000001${i}0`,
      email: null,
      source: 'meta_leadgen',
      sourceRef: `foto-${i}`,
      createdAt: new Date(),
      skipLookup: true,
      skipQueue: true,
    });
  }

  const { token } = await createConnectionLink({
    orgId: o.id,
    projectId: project.id,
    channel: 'meta',
    createdBy: u.id,
  });

  // Sesión real
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
    tokenEnlace: token,
    sessionId,
    clientCookie,
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

// ---------------------------------------------------------------------------

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

/**
 * Jerga de desarrollo, buscada sobre el texto RENDERIZADO.
 *
 * La prueba estática mira el código; esto mira lo que de verdad acabó en la
 * pantalla. Es lo que caza los mensajes que nacen en tiempo de ejecución — el
 * 401 crudo de Google Ads con su `request_id` no está escrito en ningún .tsx.
 */
const JERGA_VISIBLE = [
  'composio',
  'auth_config',
  'api key',
  'api_key',
  'request_id',
  'bridge',
  'baileys',
  'webhook',
  'undefined',
  'null',
  '[object',
  'internal server error',
  'unauthorized',
  'forbidden',
  'traceback',
  'stack',
  'env var',
  'process.env',
  'próximo',
  'soon',
  'phase ',
  // Con qué está hecho por dentro no es asunto de quien vende departamentos.
  'neon',
  'vercel',
  'cron',
  'postgres',
  'sonnet',
  'openrouter',
  'clerk',
  'twilio',
  'endpoint',
  'backend',
  'early access',
  'draft',
  'workflow',
];

function buscarJerga(texto: string): string[] {
  const t = texto.toLowerCase();
  return JERGA_VISIBLE.filter((j) => t.includes(j));
}

async function capturar(
  browser: Browser,
  e: Escenario,
  pantalla: string,
  ruta: string,
  preparar?: (page: Page) => Promise<void>,
): Promise<void> {
  for (const t of TAMANOS) {
    const token = await jwt(e);
    const context = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 2,
      locale: 'es-MX',
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    const page = await context.newPage();
    const erroresJs: string[] = [];
    page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const texto = msg.text();
        // Los 400 de la Frontend API de Clerk son esperados fuera de
        // vliving.life (medido en la corrida 2) y no son fallas de la app.
        if (!/clerk|Failed to load resource/i.test(texto)) erroresJs.push(texto.slice(0, 200));
      }
    });

    let status: number | null = null;
    let jerga: string[] = [];
    try {
      const res = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 45_000 });
      status = res?.status() ?? null;
      if (preparar) await preparar(page);
      await page.waitForTimeout(700);
      const visible = await page.evaluate(() => document.body.innerText ?? '');
      jerga = buscarJerga(visible);
    } catch (err) {
      erroresJs.push(`navegación: ${(err as Error).message.slice(0, 160)}`);
    }

    const archivo = path.join(SALIDA, `${pantalla}-${t.nombre}.png`);
    await page.screenshot({ path: archivo, fullPage: true }).catch(() => undefined);

    // En móvil, además de la página entera, una foto de la PANTALLA tal cual.
    // La barra de abajo flota: en la foto de página completa aparece a media
    // altura y parece que tapa cosas. Con la del viewport se ve si de verdad
    // deja respirar al contenido o no.
    if (t.nombre === 'movil') {
      await page
        .screenshot({ path: path.join(SALIDA, `${pantalla}-movil-viewport.png`) })
        .catch(() => undefined);
    }
    resultados.push({ pantalla, ruta, tamano: t.nombre, status, erroresJs, jerga, archivo });
    console.log(
      `  ${status === 200 && erroresJs.length === 0 && jerga.length === 0 ? '✓' : '✗'} ${pantalla} · ${t.nombre} · HTTP ${status ?? '?'} · ${erroresJs.length} errores de JS · ${jerga.length} notas internas${jerga.length ? ` (${jerga.join(', ')})` : ''}`,
    );
    await context.close();
  }
}

/** El alta completa por UI, con el navegador, como la haría Luis. */
async function altaPorUI(browser: Browser, e: Escenario): Promise<string | null> {
  console.log('\n— alta de proyecto por la interfaz (WebKit) —');
  const token = await jwt(e);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const page = await context.newPage();
  const errores: string[] = [];
  page.on('pageerror', (err) => errores.push(String(err.message).slice(0, 200)));

  await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle', timeout: 45_000 });

  // Paso 1 — qué es
  await page.getByPlaceholder('V&LIVING').fill('Zuxen Residencial');
  await page.getByPlaceholder('vliving.site').fill('zuxen.mx');
  await page.getByPlaceholder('Tulum').fill('Guadalajara');
  await page.screenshot({ path: path.join(SALIDA, 'flujo-alta-paso1.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();

  // Paso 2 — cómo vende
  await page.getByPlaceholder('Sofía').waitFor({ timeout: 20_000 });
  await page.getByPlaceholder('Sofía').fill('Renata');
  await page.getByPlaceholder('claro y directo, de tú').fill('cálida y profesional, de usted');
  await page
    .getByPlaceholder('descuentos, fechas de entrega, rendimientos garantizados')
    .fill('descuentos ni fechas de entrega');
  await page
    .getByPlaceholder('lunes a viernes de 9 a 19, sábado de 10 a 14')
    .fill('lunes a sábado de 9 a 20');
  await page.getByPlaceholder('Luis · +52 1 998 000 0000').fill('Luis · +52 1 998 000 0000');
  await page.screenshot({ path: path.join(SALIDA, 'flujo-alta-paso2.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar y seguir' }).click();

  // Paso 3 — conexiones
  await page.getByText('Facebook e Instagram').first().waitFor({ timeout: 20_000 });
  await page.screenshot({ path: path.join(SALIDA, 'flujo-alta-paso3.png'), fullPage: true });
  await page.getByRole('button', { name: 'Entrar al proyecto' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const url = page.url();
  const nuevoId = url.match(/\/projects\/([0-9a-f-]{36})/)?.[1] ?? null;
  await page.screenshot({ path: path.join(SALIDA, 'flujo-alta-listo.png'), fullPage: true });

  console.log(`  proyecto creado por UI: ${nuevoId ?? 'ninguno'} · ${errores.length} errores de JS`);
  await context.close();
  return nuevoId;
}

// ---------------------------------------------------------------------------

async function limpiar(e: Escenario | null, extra: string[]): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const proyectos = [e.projectId, ...extra];
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(salesLeads).where(eq(salesLeads.orgId, e.orgId)));
  await paso(() => db.delete(projectEvents).where(inArray(projectEvents.projectId, proyectos)));
  await paso(() => db.delete(connectionLinks).where(inArray(connectionLinks.projectId, proyectos)));
  await paso(() => db.delete(projectMembers).where(inArray(projectMembers.projectId, proyectos)));
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
 * ruta absoluta (`PLAYWRIGHT_PATH`) porque en esta máquina hay dos copias y la
 * resolución normal de Node encuentra primero la vieja, que pide un WebKit que
 * ya no está en `/root/.cache/ms-playwright`.
 *
 * No se corre `playwright install` para arreglarlo: instalar una versión borra
 * los navegadores de las otras (pasó el 02-sep). Se apunta a la copia que ya
 * tiene su WebKit.
 */
async function cargarWebkit() {
  const ruta =
    process.env.PLAYWRIGHT_PATH ??
    '/root/.nvm/versions/node/v20.20.2/lib/node_modules/playwright';
  const mod = await import(ruta);
  return (mod.webkit ?? mod.default?.webkit) as typeof import('playwright').webkit;
}

async function main(): Promise<void> {
  mkdirSync(SALIDA, { recursive: true });
  console.log(`CAPTURAS · corrida 3 · ${BASE} → ${SALIDA}`);

  let e: Escenario | null = null;
  const creadosPorUI: string[] = [];
  const webkit = await cargarWebkit();
  const browser = await webkit.launch();
  try {
    e = await montar();
    console.log(`  escenario: org ${e.orgId} · proyecto ${e.projectId}`);

    const p = e.projectId;
    console.log('\n— recorrido —');
    await capturar(browser, e, '01-landing', '/');
    await capturar(browser, e, '02-proyectos', '/projects');
    await capturar(browser, e, '03-alta-proyecto', '/projects/new');
    await capturar(browser, e, '04-inicio-proyecto', `/projects/${p}`);
    await capturar(browser, e, '05-conexiones', `/projects/${p}/conexiones`);
    await capturar(browser, e, '06-equipo', `/projects/${p}/equipo`);
    await capturar(browser, e, '07-leads', `/projects/${p}/leads`);
    await capturar(browser, e, '08-conversaciones', `/projects/${p}/conversaciones`);
    await capturar(browser, e, '09-campanas', `/projects/${p}/campanas`);
    await capturar(browser, e, '10-contenido', `/projects/${p}/contenido`);
    await capturar(browser, e, '11-conocimiento', `/projects/${p}/conocimiento`);
    await capturar(browser, e, '12-ajustes', `/projects/${p}/ajustes`);
    await capturar(browser, e, '13-enlace-conexion', `/conectar/${e.tokenEnlace}`);
    await capturar(browser, e, '14-enlace-caducado', '/conectar/token-que-no-existe');
    // Las de la organización, que no son de un proyecto pero las ve el mismo
    // cliente: el barrido de notas internas también pasa por aquí.
    await capturar(browser, e, '15-organizacion', '/organizacion');
    await capturar(browser, e, '16-prospeccion', '/prospectos');
    await capturar(browser, e, '17-competencia', '/competencia');
    await capturar(browser, e, '18-calendario', '/plan');

    const nuevo = await altaPorUI(browser, e);
    if (nuevo) creadosPorUI.push(nuevo);

    // ¿De verdad quedó en la base, o solo se vio bonito?
    if (nuevo) {
      const fila = await db.select().from(campaigns).where(eq(campaigns.id, nuevo)).limit(1);
      const miembros = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, nuevo));
      console.log(
        `  en la base: nombre="${fila[0]?.name}" ciudad="${fila[0]?.city}" sitio="${fila[0]?.website}" · vendedor ${fila[0]?.sellerPersona ? 'definido' : 'vacío'} · dueños ${miembros.filter((m) => m.role === 'dueño').length}`,
      );
    }
  } finally {
    await browser.close();
    await limpiar(e, creadosPorUI);
  }

  const con200 = resultados.filter((r) => r.status === 200).length;
  const conErrores = resultados.filter((r) => r.erroresJs.length > 0);
  const conJerga = resultados.filter((r) => r.jerga.length > 0);
  const resumen = {
    base: BASE,
    capturas: resultados.length,
    http200: con200,
    pantallasConErroresDeJs: conErrores.length,
    pantallasConNotasInternas: conJerga.length,
    detalle: resultados,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));

  console.log(
    `\n${resultados.length} capturas · ${con200} con HTTP 200 · ${conErrores.length} con errores de JS · ${conJerga.length} con notas internas`,
  );
  for (const r of conErrores) console.log(`  ✗ ${r.pantalla} (${r.tamano}): ${r.erroresJs.join(' | ')}`);
  for (const r of conJerga) console.log(`  ✗ ${r.pantalla} (${r.tamano}) jerga: ${r.jerga.join(', ')}`);
  if (conErrores.length > 0 || conJerga.length > 0 || con200 !== resultados.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
