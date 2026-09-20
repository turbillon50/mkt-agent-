/**
 * Capturas de la corrida 10 — la SALA DE ARTE Y COMUNICACIÓN, en WebKit a 1440.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c10.ts
 *
 * No es sacar fotos. Con una sesión REAL de Clerk:
 *   · monta un proyecto con kit de marca y una pieza con imagen de verdad;
 *   · abre la Sala y CAPTURA las seis redes, una por una, apretando su pestaña;
 *   · comprueba a máquina lo que el ojo no cuenta: que el visor pinte un lienzo
 *     para cada red, que la compuerta muestre semáforo, que la guía "cómo se
 *     postea aquí" esté, y que el contador de caracteres exista;
 *   · captura la compuerta en ROJO con la regla citada (la promesa de
 *     rendimiento del spec) para dejar ver la cita con su URL.
 *   · lee el texto renderizado y lo barre contra la jerga de desarrollo.
 *
 * Al final borra todo lo que creó.
 *
 * El truco de la sesión (Authorization: Bearer y no cookie) es el mismo de la
 * corrida 7: la instancia de Clerk es de producción, su dominio es vliving.life,
 * y desde 127.0.0.1 la cookie entra en el bucle del handshake. Con el JWT en el
 * encabezado, el middleware valida el mismo token.
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
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { saveBrandKit } from '../src/creative/brand-kit';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c10');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

/** Escritorio, como manda el rediseño. El spec pide 1440 para las seis redes. */
const TAMANO = { width: 1440, height: 900 };

/** Las seis redes de la Sala, con la etiqueta tal como sale en la pestaña. */
const REDES = [
  { slug: 'facebook', label: 'Facebook' },
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'linkedin', label: 'LinkedIn' },
  { slug: 'twitter', label: 'X' },
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'youtube', label: 'YouTube' },
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

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c10_${marca}`;
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
  const slug = `qa-c10-${marca}`;
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
  await upsertMembership({ id: `orgmem_${marca}`, orgId: o.id, clerkUserId: u.id, email, role: 'org:admin' });

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
        { rol: 'acento', hex: '#F4B740', nombre: 'Ámbar' },
      ],
      tipografias: [
        { rol: 'titulos', familia: 'Inter', peso: '700' },
        { rol: 'texto', familia: 'Inter', peso: '400' },
      ],
      tono: 'Directo y cálido. Tuteamos.',
      palabrasProhibidas: ['barato', 'gratis total'],
    },
    email,
  );

  // Una pieza con imagen REAL para que el visor tenga qué recortar, y un texto
  // largo para que se vea el corte "ver más" en las redes que lo cortan.
  await db.insert(creativePieces).values({
    orgId: o.id,
    projectId: project.id,
    red: 'instagram',
    formato: 'instagram-feed-45',
    tipo: 'imagen',
    brief:
      'Departamento modelo abierto este fin de semana en Polanco. Ven a conocer los acabados, la terraza con vista al parque y el modelo de dos recámaras que se está yendo rapidísimo. Agenda tu visita hoy y te esperamos con un café.',
    prompt: '(captura)',
    modelo: 'gemini-2.5-flash-image',
    motor: 'sharp' as const,
    url: 'https://vmomentum.site/img/home-hero.jpg',
    ancho: 1080,
    alto: 1350,
    estado: 'propuesta' as const,
    metadata: { angulo: 'Producto limpio' },
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
  if (!sessionId || !cookie) throw new Error(`no se pudo montar la sesión: ${JSON.stringify(cuerpo).slice(0, 300)}`);

  return { orgId: o.id, clerkId: u.id, userId: dbUser!.id, email, projectId: project.id, sessionId, clientCookie: cookie };
}

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

const JERGA_VISIBLE = [
  'auth_config', 'api key', 'api_key', 'request_id', 'undefined', '[object',
  'internal server error', 'unauthorized', 'forbidden', 'traceback', 'env var',
  'process.env', 'oauth', 'sharp', 'aspect_ratio', 'data:image', 'neon',
  'vercel', 'postgres', 'clerk', 'endpoint', 'backend',
];

interface Medida {
  red: string;
  status: number | null;
  lienzo: boolean;
  semaforo: string | null;
  guia: boolean;
  contador: boolean;
  citaFuente: boolean;
  erroresJs: string[];
  jerga: string[];
  archivo: string;
}
const medidas: Medida[] = [];

async function contexto(browser: Browser, e: Escenario) {
  const token = await jwt(e);
  return browser.newContext({
    viewport: TAMANO,
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

/** Abre la Sala, aprieta la pestaña de la red y la captura + mide. */
async function capturarRed(browser: Browser, e: Escenario, red: (typeof REDES)[number], i: number) {
  const context = await contexto(browser, e);
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
  try {
    const res = await page.goto(`${BASE}/projects/${e.projectId}/contenido`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    status = res?.status() ?? null;
    // La Sala carga las piezas por fetch y revisa sola al montar; hay que esperar.
    await page.waitForTimeout(2500);
    // Apretar la pestaña de esta red.
    await page
      .locator('[data-sala-redes] button', { hasText: new RegExp(`^${red.label}$`) })
      .first()
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    // Cambiar de red dispara otra revisión con el modelo: se le da aire.
    await page.waitForTimeout(3500);
  } catch (err) {
    erroresJs.push(`navegación: ${(err as Error).message.slice(0, 160)}`);
  }

  const lectura = (await page.evaluate(`(() => {
    const texto = document.body.innerText || '';
    const t2 = texto.toLowerCase();
    return {
      // Un lienzo del visor: la Sala pinta el marco de la red dentro del centro.
      lienzo: Boolean(document.querySelector('[data-sala-redes]')) && /lienzo/.test(t2),
      semaforo:
        t2.includes('se puede publicar') ? 'verde'
        : t2.includes('sale, pero') || t2.includes('léelo antes') ? 'ambar'
        : t2.includes('no se publica') ? 'rojo'
        : t2.includes('el texto cambió') ? 'viejo'
        : null,
      guia: t2.includes('cómo se postea') || t2.includes('cómo se publica') || t2.includes('mejores prácticas') || t2.includes('así se postea'),
      contador: t2.includes('caracteres'),
      citaFuente: Boolean(document.querySelector('a[href^="https://developers."], a[href^="https://transparency."], a[href^="https://help."], a[href^="https://www.diputados"], a[href^="https://legal."]')),
    };
  })()`)) as Omit<Medida, 'red' | 'status' | 'erroresJs' | 'jerga' | 'archivo'>;

  const visible = (await page.evaluate(`document.body.innerText || ''`)) as string;
  const jerga = JERGA_VISIBLE.filter((j) => visible.toLowerCase().includes(j));

  const archivo = path.join(SALIDA, `${String(i + 1).padStart(2, '0')}-sala-${red.slug}-1440.png`);
  await page.screenshot({ path: archivo, fullPage: true }).catch(() => undefined);

  const m: Medida = { red: red.slug, status, ...lectura, erroresJs, jerga, archivo };
  medidas.push(m);
  console.log(
    `  ${status === 200 && erroresJs.length === 0 && jerga.length === 0 ? '✓' : '✗'} ${red.label} · HTTP ${status ?? '?'} · lienzo:${m.lienzo ? '✓' : '✗'} · semáforo:${m.semaforo ?? '—'} · guía:${m.guia ? '✓' : '✗'} · contador:${m.contador ? '✓' : '✗'} · cita:${m.citaFuente ? '✓' : '✗'} · ${erroresJs.length} JS · ${jerga.length} jerga${jerga.length ? ` (${jerga.join(', ')})` : ''}`,
  );
  await context.close();
}

/**
 * La compuerta en ROJO con la regla citada: se escribe la promesa de
 * rendimiento del spec en el editor y se mira que salga rojo con su URL.
 */
async function capturarCompuertaRoja(browser: Browser, e: Escenario) {
  console.log('\n— la compuerta en rojo, con la regla citada —');
  const context = await contexto(browser, e);
  const page = await context.newPage();
  await page.goto(`${BASE}/projects/${e.projectId}/contenido`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);

  const promesa = 'Invierte en Polanco: te garantizamos 20% de rendimiento anual, sin riesgo.';
  await page.locator('#sala-texto').fill(promesa).catch(() => undefined);
  await page.getByRole('button', { name: /Revisar de nuevo|Revisando/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(4000);

  const lectura = (await page.evaluate(`(() => {
    const t2 = (document.body.innerText || '').toLowerCase();
    return {
      rojo: t2.includes('no se publica'),
      citaMeta: Boolean(document.querySelector('a[href*="transparency.meta.com"], a[href*="meta.com/policies"]')),
      citaLey: Boolean(document.querySelector('a[href*="diputados.gob.mx"], a[href*="ordenjuridico"]')),
      sinBotonAprobar: !Array.from(document.querySelectorAll('button')).some((b) => /^aprobar/i.test((b.textContent || '').trim())),
    };
  })()`)) as { rojo: boolean; citaMeta: boolean; citaLey: boolean; sinBotonAprobar: boolean };

  const archivo = path.join(SALIDA, '07-compuerta-rojo-regla-citada-1440.png');
  await page.screenshot({ path: archivo, fullPage: true }).catch(() => undefined);
  console.log(
    `  rojo:${lectura.rojo ? '✓' : '✗'} · cita Meta:${lectura.citaMeta ? '✓' : '✗'} · cita ley MX:${lectura.citaLey ? '✓' : '✗'} · sin botón Aprobar:${lectura.sinBotonAprobar ? '✓' : '✗'}`,
  );
  await context.close();
  return lectura;
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => { await fn().catch(() => undefined); };
  await paso(() => db.delete(creativePieces).where(eq(creativePieces.projectId, e.projectId)));
  await paso(() => db.delete(projectBrandKit).where(eq(projectBrandKit.projectId, e.projectId)));
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
  let compuertaRoja: Awaited<ReturnType<typeof capturarCompuertaRoja>> | null = null;

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}\n`);
    console.log('— la Sala, red por red, a 1440 —');
    for (let i = 0; i < REDES.length; i++) {
      await capturarRed(browser, e, REDES[i]!, i);
    }
    compuertaRoja = await capturarCompuertaRoja(browser, e);
  } catch (err) {
    console.error('\n✗ explotó:', err);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const limpias = medidas.filter((m) => m.status === 200 && m.erroresJs.length === 0 && m.jerga.length === 0);
  const resumen = {
    corrida: 'c10',
    base: BASE,
    redes: medidas.length,
    http200: medidas.filter((m) => m.status === 200).length,
    conLienzo: medidas.filter((m) => m.lienzo).length,
    conGuia: medidas.filter((m) => m.guia).length,
    conContador: medidas.filter((m) => m.contador).length,
    conSemaforo: medidas.filter((m) => m.semaforo).length,
    erroresJs: medidas.reduce((n, m) => n + m.erroresJs.length, 0),
    jerga: medidas.reduce((n, m) => n + m.jerga.length, 0),
    limpias: limpias.length,
    compuertaRoja,
    detalle: medidas,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));
  console.log(
    `\n${resumen.redes} redes · ${resumen.http200} HTTP 200 · lienzo:${resumen.conLienzo}/6 · guía:${resumen.conGuia}/6 · contador:${resumen.conContador}/6 · ${resumen.erroresJs} errores JS · ${resumen.jerga} jerga`,
  );
  console.log(`resumen en ${path.join(SALIDA, 'resumen.json')}`);
  process.exit(resumen.erroresJs > 0 || resumen.jerga > 0 ? 1 : 0);
}

void main();
