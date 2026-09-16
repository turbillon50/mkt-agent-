/**
 * La prueba de que las dos corridas CONVIVEN, en WebKit a 1440.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-integracion-c8.ts
 *
 * No repite lo que ya miden `capturas-c7.ts` y `capturas-c8.ts`. Mide la única
 * cosa que ninguna de las dos podía medir sola, porque cada una vivía en su
 * rama: que el CENTRO DE MANDO del proyecto (corrida 7 — franja de conexiones,
 * los números, la rejilla de herramientas con Prospección y Competencia, la
 * actividad) y el PANEL DE GOOSSIP siempre abierto (corrida 8 — tercera
 * columna, plegable, redimensionable) estén en la MISMA pantalla al mismo
 * tiempo y sin taparse.
 *
 * Cuatro medidas, y ninguna se puede fingir leyendo el código:
 *
 *   1. En el Inicio del proyecto, a 1440, el panel de Goossip está montado y
 *      tiene ancho > 0.
 *   2. `<main>` termina exactamente donde EMPIEZA el panel. Si el panel se
 *      montara encima del centro de mando, `main.right > panel.left` y aquí se
 *      vería. Es la diferencia entre reacomodar y tapar.
 *   3. Al plegar, `<main>` se ENSANCHA. Un panel que se monta encima deja el
 *      ancho de `main` igual; uno que es columna, no.
 *   4. El centro de mando sigue completo: las 8 herramientas, la franja de
 *      conexiones y la actividad se leen con el panel abierto.
 *
 * Y una que es de la integración y de nadie más: en el Inicio a 1440 NO puede
 * haber dos chats. El Asistente embebido de la corrida 7 se esconde de 1250 px
 * para arriba porque ahí el panel de la 8 ya está abierto; abajo de 1250 sigue
 * siendo la columna ancha del Inicio, como lo entregó la 7.
 *
 * La sesión, el montaje y la limpieza son los mismos de `capturas-c8.ts`, por
 * la misma razón de allá: la instancia de Clerk es de producción y desde
 * 127.0.0.1 la cookie `__session` entra en bucle de handshake. Con
 * `Authorization: Bearer` el middleware valida el mismo JWT.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { Browser, Page } from 'playwright';
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
const SALIDA = path.resolve('capturas-integracion-c8');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

/** 1440 es el tamaño que manda la misión. 1200 es el control: abajo del corte. */
const TAMANOS = [
  { nombre: '1440', width: 1440, height: 1000, conPanel: true },
  { nombre: '1200', width: 1200, height: 900, conPanel: false },
] as const;

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

const LEADS = [
  { fullName: 'Ana Gómez', phone: '5215511111111' },
  { fullName: 'Andrés Salas', phone: '5215522222222' },
  { fullName: 'Beatriz Luna', phone: '5215533333333' },
];

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_int_${marca}`;
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
  const slug = `qa-int-${marca}`;
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

const JERGA_VISIBLE = [
  'api_key',
  'request_id',
  'undefined',
  '[object',
  'internal server error',
  'traceback',
  'process.env',
  'postgres',
  'blob_read_write_token',
];

/**
 * La medida de la convivencia, en un solo `evaluate`.
 *
 * `mainDerecha` vs `panelIzquierda` es el corazón del asunto: si el panel se
 * montara ENCIMA del centro de mando, `main` seguiría llegando hasta el borde
 * de la ventana y la resta saldría negativa. Que salga 0 (o positiva, por el
 * borde de 1 px) es lo que prueba que son columnas hermanas.
 */
const MEDIR = `(() => {
  const panel = document.querySelector('aside.asistente-aside');
  const main = document.querySelector('main');
  const r = panel ? panel.getBoundingClientRect() : null;
  const m = main ? main.getBoundingClientRect() : null;
  const texto = document.body.innerText || '';
  const enlaces = Array.from(document.querySelectorAll('a')).map((a) => (a.textContent || '').trim());
  const HERRAMIENTAS = ['Campañas','Contenido','Marca','Competencia','Prospección','Conocimiento','Automatizaciones','Equipo'];
  return {
    /* ---- corrida 8: el panel ---- */
    panelMontado: Boolean(panel),
    panelAncho: r ? Math.round(r.width) : 0,
    panelIzquierda: r ? Math.round(r.left) : 0,
    panelCabecera: (() => { const h = panel && panel.querySelector('h2'); return h ? h.textContent.trim() : null; })(),
    panelTieneCompose: Boolean(panel && panel.querySelector('textarea')),
    estadoPanel: document.documentElement.dataset.asistente ?? null,
    /* ---- la convivencia ---- */
    mainAncho: m ? Math.round(m.width) : 0,
    mainDerecha: m ? Math.round(m.right) : 0,
    /* ---- corrida 7: el centro de mando ---- */
    franjaConexiones: texto.includes('Conexiones') || texto.includes('Conectar'),
    herramientas: HERRAMIENTAS.filter((t) => enlaces.some((a) => a.startsWith(t))).length,
    herramientasFaltantes: HERRAMIENTAS.filter((t) => !enlaces.some((a) => a.startsWith(t))),
    actividad: texto.includes('Actividad'),
    numeros: ['Leads sin contactar','Conversaciones abiertas','Acciones por aprobar','Posts programados']
      .filter((t) => texto.includes(t)).length,
    /* ---- la regla de la integración: un solo chat ---- */
    asistenteEmbebido: texto.includes('Asistente de'),
    flotanteVisible: Boolean(Array.from(document.querySelectorAll('button')).find(
      (b) => (b.getAttribute('aria-label') || '').includes('Abrir el Asistente') && b.getBoundingClientRect().width > 0,
    )),
    /*
      Se cuentan los VISIBLES, no los montados.

      Los tres Goossip del shell (panel, cajón y embebido) están montados a la
      vez a propósito —cuál se ve lo decide CSS, para no parpadear al hidratar—
      así que contar los textarea del DOM da 3 en cualquier ancho y no dice
      nada. Lo que importa es cuántos se PINTAN: uno.
    */
    cuadrosDeChat: Array.from(document.querySelectorAll('textarea'))
      .filter((x) => x.getBoundingClientRect().width > 0).length,
  };
})()`;

interface Toma {
  nombre: string;
  tamano: string;
  status: number | null;
  archivo: string;
  erroresJs: string[];
  jerga: string[];
  medidas: Record<string, unknown>;
}
const tomas: Toma[] = [];

function vigilar(page: Page, erroresJs: string[]): void {
  page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!/clerk|Failed to load resource/i.test(t)) erroresJs.push(t.slice(0, 200));
    }
  });
}

async function laVuelta(browser: Browser, e: Escenario, t: (typeof TAMANOS)[number]) {
  console.log(`\n— Inicio del proyecto a ${t.nombre} —`);
  const token = await jwt(e);
  const context = await browser.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    locale: 'es-MX',
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const page = await context.newPage();
  const erroresJs: string[] = [];
  vigilar(page, erroresJs);

  const anotar = async (nombre: string, status: number | null) => {
    const medidas = (await page.evaluate(MEDIR)) as Record<string, number | string | boolean>;
    const archivo = path.join(SALIDA, `${nombre}-${t.nombre}.png`);
    await page.screenshot({ path: archivo, fullPage: false }).catch(() => undefined);
    const visible = ((await page.evaluate(`document.body.innerText || ''`)) as string).toLowerCase();
    const jerga = JERGA_VISIBLE.filter((j) => visible.includes(j));
    tomas.push({ nombre, tamano: t.nombre, status, archivo, erroresJs: [...erroresJs], jerga, medidas });
    console.log(
      `  ${nombre} · panel ${medidas.panelAncho}px · main ${medidas.mainAncho}px` +
        ` · herramientas ${medidas.herramientas}/8 · chats ${medidas.cuadrosDeChat}` +
        ` · ${erroresJs.length} errores de JS${jerga.length ? ` · jerga: ${jerga.join(', ')}` : ''}`,
    );
    return medidas;
  };

  const res = await page.goto(`${BASE}/projects/${e.projectId}`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });
  // La guía del panel y la franja de conexiones se piden después de pintar.
  await page.waitForTimeout(3500);
  const abierto = await anotar('01-inicio-con-goossip-abierto', res?.status() ?? null);

  // Plegar. Si `main` no se ensancha, el panel estaba montado encima.
  await page
    .locator('button[aria-label="Plegar el panel"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
  const plegado = await anotar('02-inicio-con-goossip-plegado', null);

  await page
    .locator('button[aria-label="Abrir Goossip (Ctrl+K)"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);

  await context.close();

  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const veredicto = t.conPanel
    ? {
        panelVisible: Boolean(abierto.panelMontado) && num(abierto.panelAncho) > 0,
        /* main termina donde empieza el panel: el centro de mando NO está tapado */
        noSeTapan: num(abierto.mainDerecha) <= num(abierto.panelIzquierda) + 2,
        /* plegar ENSANCHA el contenido: es columna, no capa encima */
        elContenidoSeReacomoda: num(plegado.mainAncho) > num(abierto.mainAncho),
        ganadoAlPlegar: num(plegado.mainAncho) - num(abierto.mainAncho),
        tiraAlPlegar: num(plegado.panelAncho),
        centroDeMandoCompleto: num(abierto.herramientas) === 8 && Boolean(abierto.actividad),
        unSoloChat: num(abierto.cuadrosDeChat) === 1 && abierto.asistenteEmbebido === false,
        sinFlotanteDeMas: abierto.flotanteVisible === false,
      }
    : {
        /* abajo del corte manda la corrida 7, tal como se entregó */
        panelOculto: num(abierto.panelAncho) === 0,
        asistenteEmbebido: abierto.asistenteEmbebido === true,
        centroDeMandoCompleto: num(abierto.herramientas) === 8 && Boolean(abierto.actividad),
        sinFlotanteEnElInicio: abierto.flotanteVisible === false,
      };

  for (const [k, v] of Object.entries(veredicto)) {
    if (typeof v === 'boolean') console.log(`  ${v ? '✓' : '✗'} ${k}`);
    else console.log(`    ${k}: ${v}`);
  }
  return { abierto, plegado, veredicto };
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
    for (const t of TAMANOS) {
      vueltas[t.nombre] = await laVuelta(browser, e, t);
    }
  } catch (err) {
    console.error('\n✗ explotó:', err);
    vueltas.exploto = String((err as Error).message).slice(0, 300);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  const resumen = {
    corrida: 'integracion-c7-c8',
    base: BASE,
    capturas: tomas.length,
    erroresJs: tomas.reduce((n, c) => n + c.erroresJs.length, 0),
    notasInternas: tomas.reduce((n, c) => n + c.jerga.length, 0),
    vueltas,
    detalle: tomas,
  };
  writeFileSync(path.join(SALIDA, 'resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  console.log(
    `\n${tomas.length} capturas · ${resumen.erroresJs} errores de JS · ${resumen.notasInternas} notas internas`,
  );
  console.log(`resumen: ${path.join(SALIDA, 'resumen.json')}`);
  process.exit(0);
}

void main();
