/**
 * Capturas de la corrida 6, en WebKit, a 1440 (escritorio primero, como manda
 * el issue) y a 390 de pilón.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c6.ts
 *
 * No es sacar fotos. Con una sesión REAL de Clerk:
 *   · monta un proyecto con kit de marca cargado y piezas ya generadas —las
 *     tres situaciones que puede ver un cliente en esta corrida;
 *   · ABRE el Asistente con el atajo de teclado y comprueba que el panel salga
 *     y traiga la guía activa con sus botones;
 *   · lee el texto renderizado y lo barre contra la jerga de desarrollo.
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
import type { Browser, Page } from 'playwright';
import { db } from '../src/db/client';
import {
  campaigns,
  creativePieces,
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
const SALIDA = path.resolve('capturas-c6');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const TAMANOS = [
  { nombre: 'escritorio', width: 1440, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
] as const;

/** Piezas de mentira pero con URL de verdad: la galería tiene que pintar algo. */
const PIEZAS_DE_MUESTRA = [
  { angulo: 'Producto limpio', url: 'https://vmomentum.site/img/home-hero.jpg' },
  { angulo: 'Persona en contexto', url: 'https://vmomentum.site/img/home-person-mariana.jpg' },
  { angulo: 'Gráfico de marca', url: 'https://vmomentum.site/img/home-person-andres.jpg' },
];

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

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c6_${marca}`;
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
  const slug = `qa-c6-${marca}`;
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

  // El kit de marca, con el logo REAL de vmomentum.site.
  await saveBrandKit(
    o.id,
    project.id,
    {
      logoUrl: 'https://vmomentum.site/brand/mark.png',
      paleta: [
        { rol: 'primario', hex: '#0B5FFF', nombre: 'Azul Momentum' },
        { rol: 'fondo', hex: '#0B1220', nombre: 'Noche' },
        { rol: 'texto', hex: '#FFFFFF', nombre: 'Blanco' },
        { rol: 'acento', hex: '#F4B740', nombre: 'Ámbar' },
      ],
      tipografias: [
        { rol: 'titulos', familia: 'Inter', peso: '700' },
        { rol: 'texto', familia: 'Inter', peso: '400' },
      ],
      tono: 'Directo y cálido. Tuteamos. Nada de exclamaciones ni mayúsculas gritadas.',
      palabrasProhibidas: ['barato', 'gratis total'],
    },
    email,
  );

  // Tres piezas en la galería, con su lote, para que se vea el filtro y los
  // botones de decidir.
  const loteId = crypto.randomUUID();
  await db.insert(creativePieces).values(
    PIEZAS_DE_MUESTRA.map((p) => ({
      orgId: o.id,
      projectId: project.id,
      red: 'instagram',
      formato: 'instagram-feed-45',
      tipo: 'imagen',
      brief: 'Departamento modelo abierto este fin de semana en Polanco.',
      prompt: '(prueba)',
      modelo: 'gemini-2.5-flash-image',
      motor: 'sharp' as const,
      url: p.url,
      ancho: 1080,
      alto: 1350,
      estado: 'propuesta' as const,
      loteId,
      metadata: { angulo: p.angulo },
    })),
  );

  // Un lead viejo sin contactar, para que la guía activa tenga qué decir.
  await db.insert(salesLeads).values({
    orgId: o.id,
    userId: dbUser!.id,
    campaignId: project.id,
    fullName: 'Prospecto de prueba',
    phone: '5215500000000',
    stage: 'nuevo',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  });

  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, expires_in_seconds: 3600 }),
  });
  const res = await fetch(`https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
    body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
  });
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

/** Jerga de desarrollo que el cliente NO debe leer en pantalla. */
const JERGA_VISIBLE = [
  'auth_config',
  'api key',
  'api_key',
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
  'sharp',
  'prompt',
  'aspect_ratio',
  'data:image',
  'neon',
  'vercel',
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
  soloEscritorio = false,
): Promise<void> {
  for (const t of TAMANOS) {
    if (soloEscritorio && t.nombre !== 'escritorio') continue;
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
 * Lo que de verdad importa de esta corrida: que el Asistente ABRA en cualquier
 * pantalla con el atajo y traiga la guía activa con botones.
 */
async function pruebaDelPanel(browser: Browser, e: Escenario) {
  console.log('\n— el Asistente, abierto con el atajo, sobre la pantalla de Leads —');
  const context = await contexto(browser, e, { width: 1440, height: 900 });
  const page = await context.newPage();
  await page.goto(`${BASE}/projects/${e.projectId}/leads`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(2500);

  // Sin funciones declaradas dentro del `evaluate`: esbuild las envuelve con su
  // helper `__name`, que no existe en el navegador (medido en la corrida 5).
  const lectura = (await page.evaluate(`(() => {
    const panel = document.querySelector('aside[aria-hidden="false"]');
    const texto = panel ? (panel.innerText || '') : '';
    return {
      abierto: Boolean(panel),
      sugerencias: panel ? panel.querySelectorAll('div[class*="border-l-2"]').length : 0,
      botones: panel ? Array.from(panel.querySelectorAll('a,button')).map((b) => (b.textContent || '').trim()).filter(Boolean) : [],
      texto: texto.slice(0, 1200),
      siguePintadoElFondo: Boolean(document.querySelector('main')),
    };
  })()`)) as {
    abierto: boolean;
    sugerencias: number;
    botones: string[];
    texto: string;
    siguePintadoElFondo: boolean;
  };

  console.log(`  ${lectura.abierto ? '✓' : '✗'} el panel abrió con Ctrl+K`);
  console.log(`  sugerencias con botón: ${lectura.sugerencias}`);
  console.log(`  botones: ${lectura.botones.slice(0, 8).join(' · ')}`);
  console.log(`  ${lectura.siguePintadoElFondo ? '✓' : '✗'} la pantalla de atrás sigue ahí`);

  await page
    .screenshot({ path: path.join(SALIDA, '01-asistente-abierto-escritorio.png'), fullPage: false })
    .catch(() => undefined);

  // Y que cierre con Escape: un cajón que no cierra es una pantalla.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const cerro = (await page.evaluate(
    `Boolean(document.querySelector('aside[aria-hidden="true"]'))`,
  )) as boolean;
  console.log(`  ${cerro ? '✓' : '✗'} y cerró con Escape`);

  await context.close();
  return { ...lectura, cerro };
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(creativePieces).where(eq(creativePieces.projectId, e.projectId)));
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

  const { webkit } = await import('/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never);
  const browser = await webkit.launch();
  let e: Escenario | null = null;
  let panel: Awaited<ReturnType<typeof pruebaDelPanel>> | null = null;

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}\n`);
    console.log('— capturas —');

    await capturar(browser, e, '02-marca', `/projects/${e.projectId}/marca`);
    await capturar(browser, e, '03-contenido', `/projects/${e.projectId}/contenido`);
    await capturar(browser, e, '04-inicio', `/projects/${e.projectId}`);

    // La galería, filtrada por red: se aprieta la pestaña de Instagram.
    await capturar(
      browser,
      e,
      '05-galeria-filtrada',
      `/projects/${e.projectId}/contenido`,
      async (page) => {
        await page
          .getByRole('button', { name: /Instagram/ })
          .first()
          .click({ timeout: 15_000 })
          .catch(() => undefined);
        await page.waitForTimeout(1500);
      },
      true,
    );

    panel = await pruebaDelPanel(browser, e);
  } catch (err) {
    console.error('\n✗ explotó:', err);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const ok = resultados.filter((r) => r.status === 200 && r.erroresJs.length === 0 && r.jerga.length === 0);
  const resumen = {
    corrida: 'c6',
    base: BASE,
    capturas: resultados.length,
    limpias: ok.length,
    http200: resultados.filter((r) => r.status === 200).length,
    erroresJs: resultados.reduce((n, r) => n + r.erroresJs.length, 0),
    notasInternas: resultados.reduce((n, r) => n + r.jerga.length, 0),
    panel,
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
