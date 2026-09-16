/**
 * Capturas y mediciones de la corrida 4, en WebKit, a 1440×900 y 1280×720.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-c4.ts
 *
 * No son fotos bonitas: cada estado del menú se MIDE en el navegador.
 *
 *   · que el menú mida exactamente el alto de la ventana
 *   · que haya UN solo elemento con scroll dentro del menú, y que sea la zona
 *     de navegación (el bug de Luis era una caja de altura fija con 40 px)
 *   · que a 1440×900 quepan todas las secciones sin scroll
 *   · que a 1280×720 haya UN scroll natural, no diez renglones escondidos
 *   · que el arrastre respete 200–320 y que el ancho sobreviva a una recarga
 *   · que plegado sean 64 px, solo íconos, y que también sobreviva
 *   · cero inglés en lo que se ve
 *
 * Monta un escenario real (org, usuario, proyecto, campañas, leads), recorre la
 * app con sesión de verdad y borra todo al final.
 *
 * Por qué `Authorization: Bearer` y no la cookie `__session`: la instancia de
 * Clerk es de producción y su único dominio es `vliving.life`. Desde
 * `127.0.0.1` la cookie dispara el handshake de Clerk (307 en bucle, medido en
 * la corrida 2) y no se vería ni una pantalla.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { Browser, Page } from 'playwright';
import { db } from '../src/db/client';
import {
  campaigns,
  connectionLinks,
  marketingCampaigns,
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
import { saveConnection } from '../src/projects/connections';
import { createCampaign } from '../src/marketing/campaigns';

const BASE = (process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const SALIDA = path.resolve(process.env.CAPTURAS_DIR ?? 'capturas-c4');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

/** Los dos tamaños que pidió el issue. 900 de alto cabe todo; 720 no. */
const TAMANOS = [
  { nombre: '1440x900', width: 1440, height: 900 },
  { nombre: '1280x720', width: 1280, height: 720 },
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
// Escenario
// ---------------------------------------------------------------------------

interface Escenario {
  orgId: string;
  clerkId: string;
  userId: string;
  email: string;
  projectId: string;
  campanaId: string;
  sessionId: string;
  clientCookie: string;
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c4_shot_${marca}`;
  const email = `${username}@vforge.site`;

  const u = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      username,
      first_name: 'Luis',
      last_name: 'de la Torre',
      password: `Qa-Goossip-2026-${marca}A!x`,
      skip_password_checks: true,
    }),
  });
  const slug = `qa-c4-fotos-${marca}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'All Global Holding', slug, created_by: u.id }),
  });

  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, firstName: 'Luis', isAdmin: true })
    .onConflictDoNothing()
    .returning();
  const dbUser = row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];

  await upsertOrg({ id: o.id, name: 'All Global Holding', slug, ownerUserId: u.id });
  await upsertMembership({
    id: `shot4:${o.id}:${u.id}`,
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
        'Te llamas Sofía. Hablas claro y directo, de tú. Vendes para V&LIVING. Nunca prometes descuentos ni fechas de entrega.',
      rules: { escalate_to: 'Luis · +52 1 998 000 0000' },
    },
    { clerkUserId: u.id, email },
  );

  // Un segundo y un tercer proyecto: el selector vacío no enseña si sirve.
  for (const nombre of ['Zuxen Residencial', 'Ruta 618']) {
    await createProject(
      o.id,
      dbUser.id,
      { name: nombre, kind: 'servicios', sellerPersona: 'Vendedor de prueba.' },
      { clerkUserId: u.id, email },
    );
  }

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
        { id: '3312004871220118', name: 'Preventa Aldea', status: 'ACTIVE', leadsCount: 9 },
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
    externalId: 'fotos-c4-token-de-ejemplo',
  });

  // Tres campañas: una que trae leads, una en pausa y una en borrador.
  const preventa = await createCampaign(
    o.id,
    project.id,
    {
      name: 'Preventa Tulum',
      objective: 'leads',
      status: 'activa',
      channels: ['meta'],
      budget: 15000,
      metaRefs: { page_id: '1173019489236259', form_ids: ['2146578942620117'] },
      startsAt: '2026-09-01',
      endsAt: '2026-09-30',
    },
    u.id,
  );
  await createCampaign(
    o.id,
    project.id,
    {
      name: 'Remarketing septiembre',
      objective: 'mensajes',
      status: 'pausada',
      channels: ['meta', 'whatsapp'],
      budget: 6500,
    },
    u.id,
  );
  await createCampaign(
    o.id,
    project.id,
    { name: 'Aldea Zamá — fase 2', objective: 'alcance', channels: ['meta'] },
    u.id,
  );

  for (const [i, nombre] of ['Ana Ramírez', 'Jorge Peña', 'Marisol Cruz', 'Renata Solís'].entries()) {
    await ingestLead({
      project,
      fullName: nombre,
      phone: `+52155000002${i}0`,
      email: null,
      source: 'meta_leadgen',
      sourceRef: `foto-c4-${i}`,
      // Tres de la campaña y uno suelto: así se ve que la atribución no es
      // "todos los leads del proyecto" disfrazado de campaña.
      marketingCampaignId: i < 3 ? preventa.id : null,
      createdAt: new Date(),
      skipLookup: true,
      skipQueue: true,
    });
  }

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
    campanaId: preventa.id,
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
// Lo que se mide del menú, dentro del navegador
// ---------------------------------------------------------------------------

interface MedidaMenu {
  altoVentana: number;
  altoMenu: number;
  anchoMenu: number;
  /** Cuántos elementos DENTRO del menú tienen scroll de verdad. Debe ser 0 o 1. */
  cajasConScroll: number;
  /** …y cuál es. Debe ser la zona de navegación. */
  quienScrollea: string | null;
  navAlto: number;
  navContenido: number;
  navScrollea: boolean;
  /** Cuánto llegó a scrollear de verdad al empujarlo hasta el fondo. */
  navScrollMaximo: number;
  secciones: number;
  etiquetasVisibles: number;
  badges: string[];
  plegado: boolean;
}

async function medirMenu(page: Page): Promise<MedidaMenu> {
  return page.evaluate(() => {
    const menu = document.querySelector('aside');
    const nav = document.querySelector('aside nav[aria-label="Secciones"]') as HTMLElement | null;
    const enlaces = Array.from(nav?.querySelectorAll('a') ?? []) as HTMLElement[];

    // "Con scroll de verdad" = puede desplazarse, no solo tiene la propiedad.
    const conScroll: HTMLElement[] = [];
    for (const el of Array.from(menu?.querySelectorAll('*') ?? []) as HTMLElement[]) {
      const estilo = getComputedStyle(el);
      const puede = /auto|scroll/.test(estilo.overflowY);
      if (puede && el.scrollHeight - el.clientHeight > 2) conScroll.push(el);
    }

    let navScrollMaximo = 0;
    if (nav) {
      const antes = nav.scrollTop;
      nav.scrollTop = 99999;
      navScrollMaximo = nav.scrollTop;
      nav.scrollTop = antes;
    }

    const visible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    return {
      altoVentana: window.innerHeight,
      altoMenu: menu?.getBoundingClientRect().height ?? 0,
      anchoMenu: menu?.getBoundingClientRect().width ?? 0,
      cajasConScroll: conScroll.length,
      quienScrollea: conScroll[0]?.tagName.toLowerCase() ?? null,
      navAlto: nav?.clientHeight ?? 0,
      navContenido: nav?.scrollHeight ?? 0,
      navScrollea: nav ? nav.scrollHeight - nav.clientHeight > 2 : false,
      navScrollMaximo,
      secciones: enlaces.length,
      etiquetasVisibles: enlaces.filter((a) =>
        Array.from(a.querySelectorAll('.sidebar-label')).some((s) => visible(s as HTMLElement)),
      ).length,
      badges: Array.from(nav?.querySelectorAll('.sidebar-badge') ?? [])
        .map((b) => (b.textContent ?? '').trim())
        .filter((t) => t.length > 0),
      plegado: document.documentElement.dataset.sidebar === 'plegado',
    };
  });
}

// ---------------------------------------------------------------------------
// Inglés a la vista
// ---------------------------------------------------------------------------

/**
 * Palabras que solo pueden venir de un widget sin traducir. No es un corrector
 * de inglés: es la lista corta de lo que de verdad enseña Clerk cuando la
 * localización no prendió, más "Secured by Clerk".
 */
const INGLES = [
  'secured by clerk',
  'sign out',
  'sign in',
  'sign up',
  'manage account',
  'manage organization',
  'create organization',
  'leave organization',
  'personal account',
  'add account',
  'switch account',
  'no organizations',
  'members',
  'invitations',
  'settings',
  'continue',
  'back to',
  'loading',
  'something went wrong',
];

function buscarIngles(texto: string): string[] {
  const t = texto.toLowerCase();
  return INGLES.filter((p) => t.includes(p));
}

// ---------------------------------------------------------------------------

interface Resultado {
  pantalla: string;
  ruta: string;
  tamano: string;
  estado: string;
  status: number | null;
  erroresJs: string[];
  ingles: string[];
  menu: MedidaMenu | null;
  archivo: string;
}

const resultados: Resultado[] = [];

async function abrir(browser: Browser, e: Escenario, w: number, h: number): Promise<Page> {
  const token = await jwt(e);
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  /**
   * `tsx` compila con esbuild y `keepNames`, que envuelve cada función con un
   * ayudante `__name`. Ese ayudante viaja dentro del código que Playwright
   * inyecta en la página y allá no existe: `ReferenceError: __name`. Se define
   * como identidad antes de que corra nada. Es eso o escribir todas las
   * mediciones como cadenas de texto, sin tipos y sin autocompletado.
   */
  await context.addInitScript(() => {
    (window as unknown as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
  });
  const page = await context.newPage();
  return page;
}

function engancharErrores(page: Page, erroresJs: string[]): void {
  page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const texto = msg.text();
    // Los 400 de la Frontend API de Clerk son esperados fuera de vliving.life
    // (medido en la corrida 2) y no son fallas de la app.
    if (!/clerk|Failed to load resource/i.test(texto)) erroresJs.push(texto.slice(0, 200));
  });
}

async function capturar(
  browser: Browser,
  e: Escenario,
  pantalla: string,
  ruta: string,
  opciones: { estado?: string; preparar?: (page: Page) => Promise<void>; conMenu?: boolean } = {},
): Promise<void> {
  const estado = opciones.estado ?? 'abierto';
  for (const t of TAMANOS) {
    const page = await abrir(browser, e, t.width, t.height);
    const erroresJs: string[] = [];
    engancharErrores(page, erroresJs);

    let status: number | null = null;
    let ingles: string[] = [];
    let menu: MedidaMenu | null = null;
    try {
      const res = await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 45_000 });
      status = res?.status() ?? null;
      if (opciones.preparar) await opciones.preparar(page);
      await page.waitForTimeout(700);
      ingles = buscarIngles(await page.evaluate(() => document.body.innerText ?? ''));
      if (opciones.conMenu !== false) menu = await medirMenu(page);
    } catch (err) {
      erroresJs.push(`navegación: ${(err as Error).message.slice(0, 160)}`);
    }

    const archivo = path.join(SALIDA, `${pantalla}-${estado}-${t.nombre}.png`);
    // Del VIEWPORT, no de la página entera: el menú mide el alto de la ventana,
    // y una foto de página completa lo estiraría y taparía justo lo que se
    // viene a mirar — si el scroll de la navegación es uno o son tres.
    await page.screenshot({ path: archivo }).catch(() => undefined);

    resultados.push({ pantalla, ruta, tamano: t.nombre, estado, status, erroresJs, ingles, menu, archivo });
    const ok = status === 200 && erroresJs.length === 0 && ingles.length === 0;
    console.log(
      `  ${ok ? '✓' : '✗'} ${pantalla} · ${estado} · ${t.nombre} · HTTP ${status ?? '?'} · ${erroresJs.length} errores JS · ${ingles.length} en inglés${ingles.length ? ` (${ingles.join(', ')})` : ''}` +
        (menu
          ? ` · menú ${Math.round(menu.anchoMenu)}×${Math.round(menu.altoMenu)} de ${menu.altoVentana} · ${menu.cajasConScroll} caja(s) con scroll · ${menu.secciones} renglones`
          : ''),
    );
    await page.context().close();
  }
}

// ---------------------------------------------------------------------------
// Los tres estados del menú, con su medición
// ---------------------------------------------------------------------------

async function pruebaMenu(browser: Browser, e: Escenario): Promise<Record<string, unknown>> {
  console.log('\n— el menú: abierto, plegado y arrastrado —');
  const informe: Record<string, unknown> = {};

  for (const t of TAMANOS) {
    const page = await abrir(browser, e, t.width, t.height);
    const erroresJs: string[] = [];
    engancharErrores(page, erroresJs);
    await page.goto(`${BASE}/projects/${e.projectId}`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(800);

    // --- 1 · abierto, por omisión --------------------------------------------
    const abierto = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-1-abierto-${t.nombre}.png`) });

    // --- 2 · arrastrado al máximo y al mínimo --------------------------------
    // El tirador vive en el borde derecho del menú. Se empuja MÁS ALLÁ de los
    // topes a propósito: lo que se prueba es que el tope aguante, no que el
    // ratón sepa dónde parar.
    const arrastrar = async (hasta: number) => {
      const x = (await page.evaluate(
        () => document.querySelector('aside')!.getBoundingClientRect().right,
      )) as number;
      await page.mouse.move(x, 220);
      await page.mouse.down();
      await page.mouse.move(hasta, 220, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    };

    await arrastrar(500); // muy a la derecha: tiene que frenar en 320
    const ancho320 = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-2-arrastrado-320-${t.nombre}.png`) });

    await arrastrar(80); // muy a la izquierda: tiene que frenar en 200
    const ancho200 = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-3-arrastrado-200-${t.nombre}.png`) });

    // Un ancho intermedio, que es el que se deja guardado.
    await arrastrar(288);
    const anchoMedio = await medirMenu(page);
    const guardadoAncho = await page.evaluate(() => localStorage.getItem('goossip.sidebar.width'));

    // --- 3 · ¿sobrevive a una recarga? ---------------------------------------
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const trasRecarga = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-4-arrastrado-tras-recargar-${t.nombre}.png`) });

    // --- 4 · plegado ----------------------------------------------------------
    await page.getByRole('button', { name: 'Plegar el menú' }).click();
    await page.waitForTimeout(500);
    const plegado = await medirMenu(page);
    const guardadoPlegado = await page.evaluate(() =>
      localStorage.getItem('goossip.sidebar.collapsed'),
    );
    await page.screenshot({ path: path.join(SALIDA, `menu-5-plegado-${t.nombre}.png`) });

    // El globito con el nombre, que es lo único que queda al plegar.
    await page.locator('aside nav a').nth(1).hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SALIDA, `menu-6-plegado-globito-${t.nombre}.png`) });

    // --- 5 · ¿el plegado sobrevive a una recarga? -----------------------------
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const plegadoTrasRecarga = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-7-plegado-tras-recargar-${t.nombre}.png`) });

    // Se vuelve a abrir para no dejar el estado sucio a la siguiente vuelta.
    await page.getByRole('button', { name: 'Abrir el menú' }).click();
    await page.waitForTimeout(400);
    const reabierto = await medirMenu(page);
    await page.screenshot({ path: path.join(SALIDA, `menu-8-reabierto-${t.nombre}.png`) });

    informe[t.nombre] = {
      abierto,
      ancho320,
      ancho200,
      anchoMedio,
      guardadoAncho,
      trasRecarga,
      plegado,
      guardadoPlegado,
      plegadoTrasRecarga,
      reabierto,
      erroresJs,
    };

    console.log(`  ${t.nombre}:`);
    console.log(
      `    abierto     · menú ${Math.round(abierto.anchoMenu)}×${Math.round(abierto.altoMenu)} de ${abierto.altoVentana} de ventana · ${abierto.cajasConScroll} caja(s) con scroll (${abierto.quienScrollea ?? '—'}) · navegación ${abierto.navContenido} px de contenido en ${abierto.navAlto} px${abierto.navScrollea ? ` · scrollea ${abierto.navScrollMaximo} px` : ' · sin scroll'} · ${abierto.secciones} renglones`,
    );
    console.log(
      `    arrastre    · tope derecho ${Math.round(ancho320.anchoMenu)} px · tope izquierdo ${Math.round(ancho200.anchoMenu)} px · guardado ${guardadoAncho} · tras recargar ${Math.round(trasRecarga.anchoMenu)} px`,
    );
    console.log(
      `    plegado     · ${Math.round(plegado.anchoMenu)} px · ${plegado.etiquetasVisibles} etiquetas visibles de ${plegado.secciones} · guardado=${guardadoPlegado} · tras recargar ${Math.round(plegadoTrasRecarga.anchoMenu)} px · reabierto ${Math.round(reabierto.anchoMenu)} px`,
    );
    console.log(`    badges      · ${abierto.badges.join(', ') || 'ninguno (todo en cero)'}`);

    await page.context().close();
  }

  return informe;
}

/** El celular NO se tocó: se mide que la barra de abajo siga ahí y funcione. */
async function pruebaMovil(browser: Browser, e: Escenario): Promise<Record<string, unknown>> {
  console.log('\n— celular: lo que NO se tocó —');
  const page = await abrir(browser, e, 390, 844);
  const erroresJs: string[] = [];
  engancharErrores(page, erroresJs);
  await page.goto(`${BASE}/projects/${e.projectId}`, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForTimeout(800);

  const barra = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navegación principal"]');
    const aside = document.querySelector('aside');
    return {
      barraVisible: Boolean(nav && nav.getBoundingClientRect().height > 0),
      botones: nav?.querySelectorAll('button').length ?? 0,
      // El menú lateral en celular es el cajón: está fuera de la pantalla.
      menuFueraDePantalla: (aside?.getBoundingClientRect().right ?? 0) <= 0,
      anchoMenuCajon: aside?.getBoundingClientRect().width ?? 0,
    };
  });
  await page.screenshot({ path: path.join(SALIDA, 'movil-1-tabbar.png') });

  // Se abre el cajón desde "Más", como lo haría un dedo.
  await page.getByRole('button', { name: 'Más' }).click();
  await page.waitForTimeout(600);
  const cajon = await medirMenu(page);
  await page.screenshot({ path: path.join(SALIDA, 'movil-2-cajon.png') });

  console.log(
    `  barra de abajo visible=${barra.barraVisible} con ${barra.botones} botones · cajón cerrado fuera de pantalla=${barra.menuFueraDePantalla} · abierto ${Math.round(cajon.anchoMenu)} px con ${cajon.etiquetasVisibles}/${cajon.secciones} etiquetas a la vista · ${cajon.cajasConScroll} caja(s) con scroll`,
  );

  await page.context().close();
  return { ...barra, cajon, erroresJs };
}

/** El alta de campaña, por la interfaz, como la haría Luis. */
async function altaDeCampanaPorUI(browser: Browser, e: Escenario): Promise<string | null> {
  console.log('\n— alta de campaña por la interfaz (WebKit 1440) —');
  const page = await abrir(browser, e, 1440, 900);
  const errores: string[] = [];
  engancharErrores(page, errores);

  await page.goto(`${BASE}/projects/${e.projectId}/campanas`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Nueva campaña' }).click();
  await page.waitForTimeout(400);

  const nombre = `Preventa Aldea ${Date.now().toString(36)}`;
  await page.getByPlaceholder('Preventa Tulum — septiembre').fill(nombre);
  await page.getByRole('button', { name: /Abrir conversaciones/ }).click();
  await page.getByPlaceholder('15000').fill('9500');
  await page.screenshot({ path: path.join(SALIDA, 'campana-1-alta.png') });
  await page.getByRole('button', { name: 'Crear campaña' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SALIDA, 'campana-2-creada.png') });

  const fila = await db
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.projectId, e.projectId));
  const creada = fila.find((c) => c.name === nombre) ?? null;
  console.log(
    `  en la base: ${creada ? `"${creada.name}" objetivo=${creada.objective} estado=${creada.status} presupuesto=${creada.budget}` : 'NO se creó'} · ${errores.length} errores de JS`,
  );

  await page.context().close();
  return creada?.id ?? null;
}

// ---------------------------------------------------------------------------

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const proyectos = (
    await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, e.orgId))
  ).map((r) => r.id);
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(salesLeads).where(eq(salesLeads.orgId, e.orgId)));
  await paso(() => db.delete(marketingCampaigns).where(eq(marketingCampaigns.orgId, e.orgId)));
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
  console.log(`CAPTURAS · corrida 4 · ${BASE} → ${SALIDA}`);

  let e: Escenario | null = null;
  let informeMenu: Record<string, unknown> = {};
  let informeMovil: Record<string, unknown> = {};
  const webkit = await cargarWebkit();
  const browser = await webkit.launch();
  try {
    e = await montar();
    console.log(`  escenario: org ${e.orgId} · proyecto ${e.projectId}`);

    const p = e.projectId;
    console.log('\n— recorrido —');
    await capturar(browser, e, '01-inicio-proyecto', `/projects/${p}`);
    await capturar(browser, e, '02-campanas', `/projects/${p}/campanas`);
    await capturar(browser, e, '03-campana-detalle', `/projects/${p}/campanas/${e.campanaId}`);
    await capturar(browser, e, '04-leads', `/projects/${p}/leads`);
    await capturar(browser, e, '05-conexiones', `/projects/${p}/conexiones`);
    await capturar(browser, e, '06-equipo', `/projects/${p}/equipo`);
    await capturar(browser, e, '07-conocimiento', `/projects/${p}/conocimiento`);
    await capturar(browser, e, '08-ajustes', `/projects/${p}/ajustes`);
    await capturar(browser, e, '09-proyectos', '/projects');
    await capturar(browser, e, '10-asistente', '/chat');
    await capturar(browser, e, '11-admin', '/admin');
    // El desplegable de proyectos abierto: el botón "Nuevo proyecto" vive ahí.
    await capturar(browser, e, '12-selector-proyecto', `/projects/${p}`, {
      estado: 'desplegado',
      preparar: async (page) => {
        await page.locator('aside details summary').click();
        await page.waitForTimeout(400);
      },
    });

    informeMenu = await pruebaMenu(browser, e);
    informeMovil = await pruebaMovil(browser, e);
    await altaDeCampanaPorUI(browser, e);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const con200 = resultados.filter((r) => r.status === 200).length;
  const conErrores = resultados.filter((r) => r.erroresJs.length > 0);
  const conIngles = resultados.filter((r) => r.ingles.length > 0);
  writeFileSync(
    path.join(SALIDA, 'resumen.json'),
    JSON.stringify(
      {
        base: BASE,
        capturas: resultados.length,
        http200: con200,
        pantallasConErroresDeJs: conErrores.length,
        pantallasConIngles: conIngles.length,
        menu: informeMenu,
        movil: informeMovil,
        detalle: resultados,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n${resultados.length} capturas del recorrido · ${con200} con HTTP 200 · ${conErrores.length} con errores de JS · ${conIngles.length} con texto en inglés`,
  );
  for (const r of conErrores) console.log(`  ✗ ${r.pantalla} (${r.tamano}): ${r.erroresJs.join(' | ')}`);
  for (const r of conIngles) console.log(`  ✗ ${r.pantalla} (${r.tamano}) inglés: ${r.ingles.join(', ')}`);
  if (conErrores.length > 0 || conIngles.length > 0 || con200 !== resultados.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
