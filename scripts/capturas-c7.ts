/**
 * Capturas de la corrida 7, en WebKit, a 1440 y 1280 (escritorio primero, como
 * manda el rediseño aprobado) y a 390 de pilón.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c7.ts
 *
 * No es sacar fotos. Con una sesión REAL de Clerk:
 *   · monta un proyecto con kit de marca, piezas en varios estados del camino
 *     de aprobación, prospectos de Maps y un rival dado de alta;
 *   · comprueba a máquina lo que el ojo no alcanza a contar: cuántos chips de
 *     conexión trae la franja del Inicio, que el Asistente esté EMBEBIDO con
 *     sus tres sugerencias, y que el visor por red pinte los nueve formatos;
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
  competitorSnapshots,
  creativePieces,
  organizations,
  orgMemberships,
  projectBrandKit,
  projectCompetitors,
  projectMembers,
  prospects,
  salesLeads,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { saveBrandKit } from '../src/creative/brand-kit';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c7');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

/**
 * 1440 y 1280: el rediseño del Inicio es de dos columnas y el punto de quiebre
 * de `lg:` está en 1024. A 1280 las dos columnas ya conviven apretadas, que es
 * donde se rompe si se va a romper — en un monitor de 1440 nunca se ve.
 */
const TAMANOS = [
  { nombre: '1440', width: 1440, height: 900 },
  { nombre: '1280', width: 1280, height: 800 },
  { nombre: 'movil', width: 390, height: 844 },
] as const;

/**
 * Negocios REALES de Tulum, tal como los devolvió Google Places el 16-sep-2026
 * en la prueba de aceptación. No se inventa ninguno: una captura de una pantalla
 * de prospección con nombres falsos no demuestra que la prospección funcione.
 */
const PROSPECTOS_DE_MUESTRA = [
  {
    placeId: 'ChIJI2p9HKjRT48RfqnK-H0ipo8',
    name: 'Panza Tulum',
    address: 'Aldea Zama 10, 77760 Tulum, Q.R., México',
    phone: '984 120 4661',
    website: 'https://www.afloratulum.com/panza',
    rating: '4.9',
    ratingsCount: 1150,
    lat: 20.2005275,
    lng: -87.4509708,
    enrichment: {
      email: 'admin@afloratulum.com',
      whatsapp: '5219842089073',
      redes: { instagram: 'https://www.instagram.com/afloratulum' },
    },
  },
  {
    placeId: 'ChIJkXEd7APRT48RnwdqgaE2fM4',
    name: 'La Brasa Tulum',
    address: 'Calle Centauro Sur, Tulum Centro, 77760 Tulum, Q.R., México',
    phone: '984 112 3944',
    website: 'https://www.instagram.com/labrasatulum/',
    rating: '4.8',
    ratingsCount: 1526,
    lat: 20.2112241,
    lng: -87.4590821,
    enrichment: { leido: [{ url: 'https://www.instagram.com/labrasatulum/', status: -1 }] },
  },
  {
    placeId: 'ChIJ_delicia_tulum',
    name: 'DELICIA DE MI TIERRA TULUM',
    address: 'Av. Tulum, 77760 Tulum, Q.R., México',
    phone: '984 143 5023',
    website: 'https://www.restaurantedeliciademitierra.com/',
    rating: '4.8',
    ratingsCount: 1464,
    lat: 20.2131,
    lng: -87.4655,
    enrichment: {
      email: 'deliciademitierra.eventos@gmail.com',
      redes: { facebook: 'https://www.facebook.com/deliciademitierratulum' },
    },
  },
  {
    placeId: 'ChIJ_cayuco_tulum',
    name: 'El Cayuco Tulum',
    address: 'Guerra de castas, Tulum Centro, 77760 Tulum, Q.R., México',
    phone: '984 236 2000',
    website: null,
    rating: '4.9',
    ratingsCount: 1446,
    lat: 20.2098,
    lng: -87.4632,
    enrichment: {},
  },
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
  const username = `goossip_c7_${marca}`;
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
  const slug = `qa-c7-${marca}`;
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

  // Tres piezas del MISMO lote, cada una en un punto distinto del camino de
  // aprobación: así la captura enseña los botones de verdad —"Aprobar",
  // "Pedir cambios"— y no tres tarjetas idénticas en borrador.
  const loteId = crypto.randomUUID();
  const ESTADOS = ['propuesta', 'en_revision', 'aprobada'] as const;
  await db.insert(creativePieces).values(
    PIEZAS_DE_MUESTRA.map((p, i) => ({
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
      estado: ESTADOS[i] ?? ('propuesta' as const),
      loteId,
      ...(ESTADOS[i] === 'aprobada'
        ? { programadaPara: new Date(Date.now() + 2 * 86_400_000), estadoEn: new Date() }
        : {}),
      metadata: { angulo: p.angulo },
    })),
  );

  // Una cuarta, programada, para que la vista Semana tenga algo que pintar.
  await db.insert(creativePieces).values({
    orgId: o.id,
    projectId: project.id,
    red: 'facebook',
    formato: 'facebook-feed',
    tipo: 'imagen',
    brief: 'Recorrido virtual del penthouse, jueves a las 6.',
    prompt: '(prueba)',
    motor: 'sharp' as const,
    url: PIEZAS_DE_MUESTRA[0].url,
    ancho: 1440,
    alto: 1800,
    estado: 'programada' as const,
    programadaPara: new Date(Date.now() + 86_400_000),
    estadoPor: email,
    estadoEn: new Date(),
    metadata: { angulo: 'Producto limpio' },
  });

  // Prospectos de Google Maps: negocios REALES de Tulum, con sus datos tal como
  // los devolvió Places. No son inventados — son la misma búsqueda que corrió
  // la prueba de aceptación.
  await db.insert(prospects).values(
    PROSPECTOS_DE_MUESTRA.map((x) => ({
      orgId: o.id,
      projectId: project.id,
      placeId: x.placeId,
      name: x.name,
      address: x.address,
      phone: x.phone,
      website: x.website,
      rating: x.rating,
      ratingsCount: x.ratingsCount,
      category: 'Restaurante',
      lat: x.lat,
      lng: x.lng,
      mapsUrl: `https://maps.google.com/?cid=${x.placeId}`,
      source: 'google_maps',
      status: 'nuevo' as const,
      enrichment: x.enrichment,
    })),
  );

  // Un rival dado de alta y su lectura, con la fuente que de verdad contestó.
  const [rival] = await db
    .insert(projectCompetitors)
    .values({
      orgId: o.id,
      projectId: project.id,
      name: 'Lamudi México',
      website: 'https://www.lamudi.com.mx/',
      handles: { facebook: 'LamudiMexico', instagram: 'lamudimx' },
      createdBy: email,
    })
    .returning();

  await db.insert(competitorSnapshots).values([
    {
      orgId: o.id,
      projectId: project.id,
      competitorId: null,
      red: 'instagram',
      fuente: 'composio' as const,
      postsLeidos: 25,
      porSemana: '3.84',
      ultimoPost: new Date(Date.now() - 2 * 86_400_000),
      formatos: { image: 16, carousel_album: 5, video: 4 },
      seguidores: 229,
      muestra: [],
    },
    {
      orgId: o.id,
      projectId: project.id,
      competitorId: rival!.id,
      red: 'facebook',
      fuente: 'ninguna' as const,
      motivo:
        "Meta no deja leer la página de otro con esta conexión (Unsupported get request. Object with ID 'LamudiMexico' does not exist, cannot be loaded due to missing permissions).",
      postsLeidos: 0,
      formatos: {},
      muestra: [],
    },
    {
      orgId: o.id,
      projectId: project.id,
      competitorId: rival!.id,
      red: 'sitio',
      fuente: 'web' as const,
      motivo:
        'Inmobiliarias en México y Bienes raíces | Lamudi.com.mx — Lamudi el Portal líder de Inmobiliarias en México.',
      postsLeidos: 0,
      formatos: {},
      muestra: [],
    },
  ]);

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
    if (soloEscritorio && t.nombre !== '1440') continue;
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
    .screenshot({ path: path.join(SALIDA, '01-asistente-cajon-1440.png'), fullPage: false })
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

/**
 * Lo que el ojo no alcanza a contar en una captura.
 *
 * Mirar la foto dice si se ve bien; no dice si la franja de conexiones trae los
 * 24 conectores del catálogo o solo los conectados, que es exactamente el bug
 * que se vino a arreglar. Eso se cuenta a máquina, sobre el DOM renderizado.
 */
async function medirLoQueElOjoNoCuenta(browser: Browser, e: Escenario) {
  console.log('\n— lo que se cuenta a máquina, no a ojo —');
  const context = await contexto(browser, e, { width: 1440, height: 900 });
  const page = await context.newPage();

  await page.goto(`${BASE}/projects/${e.projectId}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);

  const inicio = (await page.evaluate(`(() => {
    const texto = document.body.innerText || '';
    const chips = Array.from(document.querySelectorAll('span[class*="rounded-full"][class*="border"]'))
      .map((x) => (x.textContent || '').trim())
      .filter((t) => t.length > 1 && t.length < 60);
    const herramientas = Array.from(document.querySelectorAll('a')).map((a) => (a.textContent || '').trim());
    return {
      chips: chips.length,
      conectar: chips.filter((c) => c.includes('Conectar')).length,
      proximamente: chips.filter((c) => c.includes('Próximamente')).length,
      verTodas: texto.includes('Ver todas'),
      deM: (texto.match(/\\d+ de \\d+/) || [null])[0],
      asistenteEmbebido: texto.includes('Asistente de'),
      sugerencias: ['Arma una campaña de lanzamiento', 'Redacta 5 posts para esta semana', '¿Qué hace la competencia?']
        .filter((t) => texto.includes(t)).length,
      herramientas: ['Campañas', 'Contenido', 'Marca', 'Competencia', 'Prospección', 'Conocimiento', 'Automatizaciones', 'Equipo']
        .filter((t) => herramientas.some((h) => h.startsWith(t))).length,
      actividad: texto.includes('Actividad'),
      vendedor: texto.includes('Vendedor:'),
    };
  })()`)) as Record<string, unknown>;
  console.log(`  franja de conexiones: ${inicio.chips} chips · ${inicio.conectar} con "Conectar" · ${inicio.proximamente} "Próximamente" · "${inicio.deM}"`);
  console.log(`  ${inicio.asistenteEmbebido ? '✓' : '✗'} el Asistente está EMBEBIDO · ${inicio.sugerencias}/3 sugerencias de arranque`);
  console.log(`  ${inicio.herramientas}/8 herramientas en el grid · actividad: ${inicio.actividad ? '✓' : '✗'} · vendedor: ${inicio.vendedor ? '✓' : '✗'}`);

  // El menú YA NO trae las tres secciones globales.
  const menu = (await page.evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label="Secciones"]');
    const filas = nav ? Array.from(nav.querySelectorAll('a')).map((a) => (a.textContent || '').trim()) : [];
    return {
      filas,
      tieneCompetenciaDelProyecto: filas.includes('Competencia'),
      organizacion: filas.filter((f) => ['Prospección', 'Calendario'].includes(f)).length,
    };
  })()`)) as { filas: string[]; tieneCompetenciaDelProyecto: boolean; organizacion: number };
  console.log(`  menú: ${menu.filas.length} renglones · Competencia dentro del proyecto: ${menu.tieneCompetenciaDelProyecto ? '✓' : '✗'} · globales que sobran: ${menu.organizacion}`);

  // El visor: cuántos formatos pinta de verdad.
  await page.goto(`${BASE}/projects/${e.projectId}/contenido`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Ver en cada red/ }).first().click({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const visor = (await page.evaluate(`(() => {
    const texto = document.body.innerText || '';
    const pestanas = Array.from(document.querySelectorAll('button'))
      .map((b) => (b.textContent || '').trim())
      .filter((t) => /·/.test(t) && /Facebook|Instagram|LinkedIn|X |TikTok|YouTube/.test(t));
    return {
      formatos: pestanas.length,
      redes: [...new Set(pestanas.map((p) => p.split('·')[0].trim()))],
      caracteres: texto.includes('caracteres'),
      fuente: texto.includes('documentación oficial'),
    };
  })()`)) as { formatos: number; redes: string[]; caracteres: boolean; fuente: boolean };
  console.log(`  visor: ${visor.formatos} formatos · redes: ${visor.redes.join(', ')}`);
  console.log(`  contador de caracteres: ${visor.caracteres ? '✓' : '✗'} · cita la fuente oficial: ${visor.fuente ? '✓' : '✗'}`);

  // Y la caja de WhatsApp NO está.
  await page.goto(`${BASE}/projects/${e.projectId}/leads`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);
  const whatsapp = (await page.evaluate(
    `(document.body.innerText || '').includes('Plantilla de WhatsApp')`,
  )) as boolean;
  console.log(`  ${whatsapp ? '✗' : '✓'} la caja "Plantilla de WhatsApp a un segmento" NO se ve`);

  await context.close();
  return { inicio, menu, visor, cajaDeWhatsapp: whatsapp };
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(competitorSnapshots).where(eq(competitorSnapshots.projectId, e.projectId)));
  await paso(() => db.delete(projectCompetitors).where(eq(projectCompetitors.projectId, e.projectId)));
  await paso(() => db.delete(prospects).where(eq(prospects.projectId, e.projectId)));
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
  let medidas: Awaited<ReturnType<typeof medirLoQueElOjoNoCuenta>> | null = null;

  try {
    e = await montar();
    console.log(`proyecto de prueba: ${e.projectId} · org ${e.orgId}\n`);
    console.log('— capturas —');

    // EL rediseño. Va primero porque es lo que aprobó Luis y lo que hay que mirar.
    await capturar(browser, e, '02-inicio-centro-de-mando', `/projects/${e.projectId}`);
    await capturar(browser, e, '03-prospeccion', `/projects/${e.projectId}/leads?vista=prospeccion`);
    await capturar(browser, e, '04-competencia', `/projects/${e.projectId}/competencia`);
    await capturar(browser, e, '05-contenido', `/projects/${e.projectId}/contenido`);
    await capturar(browser, e, '06-semana', `/projects/${e.projectId}/contenido?vista=semana`);
    await capturar(browser, e, '07-marca', `/projects/${e.projectId}/marca`);
    await capturar(browser, e, '08-ajustes-autonomia', `/projects/${e.projectId}/ajustes`);

    // El VISOR abierto: se aprieta "Ver en cada red" en la primera pieza.
    await capturar(
      browser,
      e,
      '09-visor-por-red',
      `/projects/${e.projectId}/contenido`,
      async (page) => {
        await page
          .getByRole('button', { name: /Ver en cada red/ })
          .first()
          .click({ timeout: 15_000 })
          .catch(() => undefined);
        await page.waitForTimeout(1200);
        // Y se cambia a historia, que es donde se dibuja la zona segura.
        await page
          .getByRole('button', { name: /historia/i })
          .first()
          .click({ timeout: 8_000 })
          .catch(() => undefined);
        await page.waitForTimeout(1200);
      },
      true,
    );

    // La caja de WhatsApp NO debe estar en el pipeline.
    await capturar(browser, e, '10-leads-sin-whatsapp', `/projects/${e.projectId}/leads`);

    medidas = await medirLoQueElOjoNoCuenta(browser, e);
    panel = await pruebaDelPanel(browser, e);
  } catch (err) {
    console.error('\n✗ explotó:', err);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const ok = resultados.filter((r) => r.status === 200 && r.erroresJs.length === 0 && r.jerga.length === 0);
  const resumen = {
    corrida: 'c7',
    base: BASE,
    capturas: resultados.length,
    limpias: ok.length,
    http200: resultados.filter((r) => r.status === 200).length,
    erroresJs: resultados.reduce((n, r) => n + r.erroresJs.length, 0),
    notasInternas: resultados.reduce((n, r) => n + r.jerga.length, 0),
    panel,
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
