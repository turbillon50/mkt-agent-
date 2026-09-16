/**
 * Capturas de la corrida 8, en WebKit, a 1440 y a 1280 — los dos tamaños de
 * escritorio que manda el issue — y una pasada de 390 para comprobar que el
 * celular sigue igual.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c8.ts
 *
 * No es sacar fotos. Con una sesión REAL de Clerk, mide lo que el spec promete
 * y que NO se puede comprobar leyendo el código:
 *
 *   1. Que sean TRES COLUMNAS de verdad: que el contenido se REACOMODE, no que
 *      quede tapado. Se mide el ancho de `<main>` con el panel abierto y con el
 *      panel plegado: si el panel se montara encima, el número no cambiaría.
 *   2. Que PLEGAR deje una tira de 48 px con su badge, no que cierre.
 *   3. Que REDIMENSIONAR con el ratón funcione y que el ancho SOBREVIVA a una
 *      recarga (prueba 3 del spec).
 *   4. Que el compose tenga sus botones y que `@` traiga leads REALES del
 *      proyecto (prueba 4 del spec) y `/` los comandos.
 *   5. Que el celular no se haya roto: a 390 el cajón sigue abriendo.
 *
 * Al final borra todo lo que creó.
 *
 * Por qué `Authorization: Bearer` y no la cookie `__session`: la instancia de
 * Clerk es de producción y su único dominio es `vliving.life`. Desde
 * `127.0.0.1` la cookie dispara el handshake de Clerk (307 en bucle, medido en
 * la corrida 2). Con el encabezado, el middleware valida el mismo JWT.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { Browser, BrowserContext, Page } from 'playwright';
import { db } from '../src/db/client';
import {
  assistantConversations,
  assistantFiles,
  assistantMessages,
  campaigns,
  organizations,
  orgMemberships,
  projectBrandKit,
  projectMembers,
  salesLeads,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { saveBrandKit } from '../src/creative/brand-kit';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c8');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const ESCRITORIOS = [
  { nombre: '1440', width: 1440, height: 900 },
  { nombre: '1280', width: 1280, height: 800 },
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

interface Escenario {
  orgId: string;
  clerkId: string;
  userId: string;
  email: string;
  projectId: string;
  sessionId: string;
  clientCookie: string;
}

const LEADS = [
  { fullName: 'Ana Gómez', phone: '5215511111111' },
  { fullName: 'Andrés Salas', phone: '5215522222222' },
  { fullName: 'Beatriz Luna', phone: '5215533333333' },
];

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c8_${marca}`;
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
  const slug = `qa-c8-${marca}`;
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
    name: 'MOMENTUM',
    kind: 'marketplace',
    website: 'https://vmomentum.site',
    city: 'Ciudad de México',
    country: 'México',
  });

  await saveBrandKit(
    o.id,
    project.id,
    {
      logoUrl: 'https://vmomentum.site/brand/mark.png',
      paleta: [
        { rol: 'primario', hex: '#0B5FFF', nombre: 'Azul Momentum' },
        { rol: 'fondo', hex: '#0B1220', nombre: 'Noche' },
        { rol: 'texto', hex: '#FFFFFF', nombre: 'Blanco' },
      ],
      tipografias: [{ rol: 'titulos', familia: 'Inter', peso: '700' }],
      tono: 'Directo y cálido.',
      palabrasProhibidas: [],
    },
    email,
  );

  // Leads reales: son los que tiene que traer el menú de `@`.
  await db.insert(salesLeads).values(
    LEADS.map((l) => ({
      orgId: o.id,
      userId: dbUser!.id,
      campaignId: project.id,
      fullName: l.fullName,
      phone: l.phone,
      stage: 'nuevo' as const,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
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

/** Clerk emite el JWT con 60 s de vida: se pide uno fresco por contexto. */
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

/** Jerga de desarrollo que el cliente NO debe leer en pantalla. */
const JERGA_VISIBLE = [
  'api_key',
  'request_id',
  'undefined',
  '[object',
  'internal server error',
  'traceback',
  'process.env',
  'data:image',
  'postgres',
  'blob_read_write_token',
];

interface Captura {
  nombre: string;
  tamano: string;
  status: number | null;
  erroresJs: string[];
  jerga: string[];
  archivo: string;
  medidas?: Record<string, unknown>;
}
const capturas: Captura[] = [];

async function contexto(
  browser: Browser,
  e: Escenario,
  t: { width: number; height: number },
): Promise<BrowserContext> {
  const token = await jwt(e);
  return browser.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

function vigilar(page: Page, erroresJs: string[]): void {
  page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const texto = msg.text();
      if (!/clerk|Failed to load resource/i.test(texto)) erroresJs.push(texto.slice(0, 200));
    }
  });
}

/**
 * Lo que mide si esto es de verdad una tercera columna: el ancho de `<main>`.
 * Un panel montado ENCIMA deja `<main>` igual de ancho con el panel abierto y
 * con el panel plegado. Uno que reacomoda, no.
 */
const MEDIR = `(() => {
  const panel = document.querySelector('aside.asistente-aside');
  const main = document.querySelector('main');
  const r = panel ? panel.getBoundingClientRect() : null;
  const m = main ? main.getBoundingClientRect() : null;
  return {
    panelAncho: r ? Math.round(r.width) : 0,
    panelVisible: Boolean(r && r.width > 0),
    mainAncho: m ? Math.round(m.width) : 0,
    mainDerecha: m ? Math.round(m.right) : 0,
    panelIzquierda: r ? Math.round(r.left) : 0,
    estado: document.documentElement.dataset.asistente ?? null,
    varAncho: document.documentElement.style.getPropertyValue('--asistente-w'),
    cabecera: (() => { const h = panel && panel.querySelector('h2'); return h ? h.textContent.trim() : null; })(),
    chips: panel ? Array.from(panel.querySelectorAll('header span')).map((s) => s.textContent.trim()).filter(Boolean).slice(0, 8) : [],
    botonesDelCompose: panel ? Array.from(panel.querySelectorAll('button[aria-label]')).map((b) => b.getAttribute('aria-label')).filter(Boolean) : [],
    hayFlotante: Boolean(Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes('Abrir el Asistente') && b.getBoundingClientRect().width > 0)),
  };
})()`;

async function tirar(page: Page, aX: number): Promise<void> {
  const tirador = page.locator('div[role="separator"][aria-label="Cambiar el ancho del panel"]');
  const caja = await tirador.boundingBox();
  if (!caja) throw new Error('no se encontró el tirador del panel');
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 300);
  await page.mouse.down();
  // En dos pasos: WebKit ignora un `move` único desde `mousedown` y el panel se
  // queda donde estaba (medido en esta corrida, primera vuelta).
  await page.mouse.move(aX + 60, caja.y + 300, { steps: 8 });
  await page.mouse.move(aX, caja.y + 300, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

async function laVueltaDeEscritorio(browser: Browser, e: Escenario, t: (typeof ESCRITORIOS)[number]) {
  console.log(`\n— escritorio ${t.nombre} —`);
  const context = await contexto(browser, e, t);
  const page = await context.newPage();
  const erroresJs: string[] = [];
  vigilar(page, erroresJs);

  const anotar = async (nombre: string, medidas: Record<string, unknown>, status: number | null) => {
    const archivo = path.join(SALIDA, `${nombre}-${t.nombre}.png`);
    await page.screenshot({ path: archivo, fullPage: false }).catch(() => undefined);
    const visible = ((await page.evaluate(`document.body.innerText || ''`)) as string).toLowerCase();
    const jerga = JERGA_VISIBLE.filter((j) => visible.includes(j));
    capturas.push({ nombre, tamano: t.nombre, status, erroresJs: [...erroresJs], jerga, archivo, medidas });
    console.log(
      `  ${jerga.length === 0 ? '✓' : '✗'} ${nombre} · panel ${medidas.panelAncho}px · main ${medidas.mainAncho}px · ${erroresJs.length} errores de JS${jerga.length ? ` · jerga: ${jerga.join(', ')}` : ''}`,
    );
    return medidas;
  };

  // 1. Abierto por omisión, en /leads.
  const res = await page.goto(`${BASE}/projects/${e.projectId}/leads`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  const abierto = (await page.evaluate(MEDIR)) as any;
  await anotar('01-abierto', abierto, res?.status() ?? null);

  // 2. Plegado con el botón: tira de 48 px, el contenido se ensancha.
  await page.locator('button[aria-label="Plegar el panel"]').click({ timeout: 15_000 });
  await page.waitForTimeout(900);
  const plegado = (await page.evaluate(MEDIR)) as any;
  await anotar('02-plegado', plegado, null);

  // 3. Desplegar y arrastrar a ~400 px.
  await page.locator('button[aria-label="Abrir Goossip (Ctrl+K)"]').click({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await tirar(page, t.width - 400);
  const arrastrado = (await page.evaluate(MEDIR)) as any;
  await anotar('03-redimensionado', arrastrado, null);

  // 4. Recargar: el ancho tiene que seguir ahí (prueba 3 del spec).
  await page.goto(`${BASE}/projects/${e.projectId}/conexiones`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  const trasRecargar = (await page.evaluate(MEDIR)) as any;
  await anotar('04-tras-recargar-en-conexiones', trasRecargar, null);

  // 5. El compose: `@` con leads reales y `/` con comandos.
  const caja = page.locator('textarea[aria-label="Mensaje para Goossip"]');
  await caja.click({ timeout: 15_000 });
  await caja.type('mándale un mensaje a @an', { delay: 60 });
  await page.waitForTimeout(1200);
  const menuArroba = (await page.evaluate(`(() => {
    const panel = document.querySelector('aside.asistente-aside');
    const menu = panel ? panel.querySelector('div[class*="absolute"][class*="bottom-full"]') : null;
    return {
      abierto: Boolean(menu),
      opciones: menu ? Array.from(menu.querySelectorAll('button')).map((b) => b.innerText.replace(/\\n/g, ' · ').trim()) : [],
    };
  })()`)) as { abierto: boolean; opciones: string[] };
  await anotar('05-menciones', { ...arrastrado, menuArroba }, null);
  console.log(`     @ → ${menuArroba.opciones.length} opciones: ${menuArroba.opciones.slice(0, 3).join(' | ')}`);

  await caja.fill('');
  await caja.type('/', { delay: 60 });
  await page.waitForTimeout(800);
  const menuBarra = (await page.evaluate(`(() => {
    const panel = document.querySelector('aside.asistente-aside');
    const menu = panel ? panel.querySelector('div[class*="absolute"][class*="bottom-full"]') : null;
    return {
      abierto: Boolean(menu),
      opciones: menu ? Array.from(menu.querySelectorAll('button')).map((b) => b.innerText.replace(/\\n/g, ' · ').trim()) : [],
    };
  })()`)) as { abierto: boolean; opciones: string[] };
  await anotar('06-comandos', { ...arrastrado, menuBarra }, null);
  console.log(`     / → ${menuBarra.opciones.length} comandos: ${menuBarra.opciones.join(' | ')}`);

  // 6. El historial.
  await caja.fill('');
  await page.locator('button[aria-label="Historial de conversaciones"]').click({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await anotar('07-historial', arrastrado, null);

  await context.close();
  return { abierto, plegado, arrastrado, trasRecargar, menuArroba, menuBarra, erroresJs };
}

/** Que el celular NO se haya roto: a 390 el cajón sigue abriendo. */
async function laVueltaDeCelular(browser: Browser, e: Escenario) {
  console.log('\n— celular 390 (que no se rompa lo que ya estaba) —');
  const context = await contexto(browser, e, { width: 390, height: 844 });
  const page = await context.newPage();
  const erroresJs: string[] = [];
  vigilar(page, erroresJs);

  await page.goto(`${BASE}/projects/${e.projectId}/leads`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const antes = (await page.evaluate(`(() => {
    const flotante = Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes('Abrir el Asistente'));
    const panel = document.querySelector('aside.asistente-aside');
    return {
      hayFlotante: Boolean(flotante && flotante.getBoundingClientRect().width > 0),
      panelDeEscritorioVisible: Boolean(panel && panel.getBoundingClientRect().width > 0),
    };
  })()`)) as { hayFlotante: boolean; panelDeEscritorioVisible: boolean };

  await page.screenshot({ path: path.join(SALIDA, '08-celular-cerrado-390.png'), fullPage: false });

  await page
    .locator('button[aria-label="Abrir el Asistente (Ctrl+K)"]')
    .click({ timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);

  const despues = (await page.evaluate(`(() => {
    const cajon = document.querySelector('aside[aria-hidden="false"]');
    return {
      cajonAbierto: Boolean(cajon),
      texto: cajon ? (cajon.innerText || '').slice(0, 300) : '',
    };
  })()`)) as { cajonAbierto: boolean; texto: string };

  await page.screenshot({ path: path.join(SALIDA, '09-celular-abierto-390.png'), fullPage: false });
  console.log(`  ${antes.hayFlotante ? '✓' : '✗'} el botón flotante sigue en celular`);
  console.log(`  ${!antes.panelDeEscritorioVisible ? '✓' : '✗'} el panel de escritorio NO se ve en celular`);
  console.log(`  ${despues.cajonAbierto ? '✓' : '✗'} el cajón abre`);

  await context.close();
  return { ...antes, ...despues, erroresJs };
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(assistantFiles).where(eq(assistantFiles.projectId, e.projectId)));
  await paso(() => db.delete(assistantMessages).where(eq(assistantMessages.projectId, e.projectId)));
  await paso(() =>
    db.delete(assistantConversations).where(eq(assistantConversations.projectId, e.projectId)),
  );
  await paso(() => db.delete(projectBrandKit).where(eq(projectBrandKit.projectId, e.projectId)));
  await paso(() => db.delete(salesLeads).where(eq(salesLeads.campaignId, e.projectId)));
  await paso(() => db.delete(projectMembers).where(eq(projectMembers.projectId, e.projectId)));
  await paso(() => db.delete(campaigns).where(eq(campaigns.id, e.projectId)));
  await paso(() => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
  await paso(() => db.delete(organizations).where(eq(organizations.id, e.orgId)));
  await paso(() => db.delete(users).where(inArray(users.id, [e.userId])));
  await paso(() => clerk(`/organizations/${e.orgId}`, { method: 'DELETE' }));
  await paso(() => clerk(`/users/${e.clerkId}`, { method: 'DELETE' }));
  console.log('  listo');
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  if (!CK) throw new Error('CLERK_SECRET_KEY no está en el entorno.');

  const { webkit } = await import(
    '/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never
  );
  const browser = await webkit.launch();
  let e: Escenario | null = null;
  const vueltas: Record<string, unknown> = {};

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}`);

    for (const t of ESCRITORIOS) {
      vueltas[t.nombre] = await laVueltaDeEscritorio(browser, e, t);
    }
    vueltas.celular = await laVueltaDeCelular(browser, e);
  } catch (err) {
    console.error('\n✗ explotó:', err);
    vueltas.exploto = String((err as Error).message).slice(0, 300);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const resumen = {
    corrida: 'c8',
    base: BASE,
    capturas: capturas.length,
    erroresJs: capturas.reduce((n, c) => n + c.erroresJs.length, 0),
    notasInternas: capturas.reduce((n, c) => n + c.jerga.length, 0),
    vueltas,
    detalle: capturas,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(`\n${capturas.length} capturas · ${resumen.erroresJs} errores de JS · ${resumen.notasInternas} notas internas`);
  console.log(`resumen: ${path.join(SALIDA, 'resumen.json')}`);
  process.exit(0);
}

void main();
