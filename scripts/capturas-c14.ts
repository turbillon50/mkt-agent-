/**
 * Capturas de la corrida 14 — la pantalla Estrategia de los dos proyectos zz-,
 * en WebKit, a 1440 y a 390.
 *
 *   NODE_OPTIONS=--max-old-space-size=3072 npm run build
 *   npm run start -- -p 3417 &
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3417 npx tsx scripts/capturas-c14.ts
 *
 * No es sacar fotos: es mirar la pantalla. Los datos son los del motor corrido de
 * verdad contra la base de desarrollo (`scripts/motor-correr.ts`), no una semilla
 * escrita a mano para que la foto salga llena.
 *
 * Además de la imagen, el guion MIDE lo que el ojo no alcanza a contar:
 *   · que cada cifra en pantalla traiga su fuente, su fecha y su método;
 *   · que no se cuele jerga de desarrollo ni un UUID a la vista;
 *   · que el precio desconocido se diga y no se disfrace;
 *   · que los huecos del radar aparezcan con su "así se mediría".
 *
 * Monta una sesión REAL de Clerk con un usuario de prueba y lo borra al final.
 * Los proyectos zz- de la base de desarrollo NO se borran: son el escenario de la
 * aceptación 1 y se reusan entre corridas.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Browser, Page } from 'playwright';
import { db } from '../src/db/client';
import { campaigns, projectMembers, users } from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { ORG_ZZ } from './zz-proyectos';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3417';
const SALIDA = path.resolve('capturas-c14');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

const TAMANOS = [
  { nombre: '1440', width: 1440, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
] as const;

/** Lo que NUNCA debe verse en una pantalla que se le enseña a un cliente. */
const JERGA_VISIBLE = [
  'undefined',
  'null',
  '[object',
  'nan',
  'internal server error',
  'unauthorized',
  'forbidden',
  'traceback',
  'process.env',
  'jsonb',
  'uuid',
  'market_signals',
  'project_brief',
  'channel_plan',
  'numeric(',
];

/** Un UUID a la vista es un error del sistema para quien lo lee. */
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Las colas de ceros de `numeric(18,4)`: "28.6000%" en vez de "28.6%". */
const RE_CEROS = /\d+\.\d*0{3,}(?!\d)/;

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
  orgClerkId: string;
  clerkId: string;
  userId: string;
  sessionId: string;
  clientCookie: string;
  proyectos: Array<{ id: string; nombre: string; slug: string }>;
}

/**
 * Monta la sesión y ENGANCHA al usuario de prueba a la organización zz- que ya
 * tiene los proyectos del motor.
 *
 * Ojo con el detalle que costó tiempo: la org de Clerk y la org de la base tienen
 * ids distintos, y los proyectos zz- cuelgan de `org_zz_motor` en la base. Así que
 * se crea la org en Clerk y después se le dice a la base que ese usuario es miembro
 * de `org_zz_motor`, que es donde vive el escenario.
 */
async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_c14_${marca}`;
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

  const slug = `qa-c14-${marca}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'zz-Pruebas del motor', slug, created_by: u.id }),
  });

  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, firstName: 'Luis', isAdmin: false })
    .onConflictDoNothing()
    .returning();
  const dbUser = row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];

  // La org de la base es `org_zz_motor`: ahí están los proyectos del motor.
  await upsertOrg({ id: ORG_ZZ, name: 'zz-Pruebas del motor', slug: 'zz-pruebas-motor', ownerUserId: u.id });
  await upsertMembership({
    id: `orgmem_c14_${marca}`,
    orgId: ORG_ZZ,
    clerkUserId: u.id,
    email,
    role: 'org:admin',
  });

  const ps = await db.select().from(campaigns).where(eq(campaigns.orgId, ORG_ZZ));
  if (!ps.length) throw new Error('no hay proyectos zz-. Corre: npx tsx scripts/zz-proyectos.ts crear');

  // Dueño de cada proyecto, para que la sección Estrategia se abra sin 403.
  for (const p of ps) {
    await db
      .insert(projectMembers)
      .values({ orgId: ORG_ZZ, projectId: p.id, userId: dbUser!.id, role: 'dueño', status: 'activo', invitedBy: u.id })
      .onConflictDoNothing();
  }

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

  return {
    orgClerkId: o.id,
    clerkId: u.id,
    userId: dbUser!.id,
    sessionId,
    clientCookie: cookie,
    proyectos: ps.map((p) => ({ id: p.id, nombre: p.name, slug: p.slug })),
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
      body: new URLSearchParams({ active_organization_id: e.orgClerkId }),
    },
  );
  const body = await res.json();
  const t = (body?.response ?? body)?.last_active_token?.jwt;
  if (!t) throw new Error(`sin jwt: ${JSON.stringify(body).slice(0, 200)}`);
  return t;
}

interface Resultado {
  pantalla: string;
  tamano: string;
  status: number | null;
  erroresJs: string[];
  jerga: string[];
  uuidsVisibles: number;
  cerosFeos: string[];
  archivo: string;
  /** Lo que se comprobó que SÍ está. Un hallazgo también es que algo aparezca. */
  presentes: string[];
  faltantes: string[];
}
const resultados: Resultado[] = [];

async function capturar(browser: Browser, e: Escenario, p: { id: string; nombre: string; slug: string }) {
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
      if (msg.type() !== 'error') return;
      const texto = msg.text();
      if (!/clerk|Failed to load resource|webpack-hmr/i.test(texto)) erroresJs.push(texto.slice(0, 200));
    });

    let status: number | null = null;
    let jerga: string[] = [];
    let uuidsVisibles = 0;
    let cerosFeos: string[] = [];
    const presentes: string[] = [];
    const faltantes: string[] = [];

    try {
      const res = await page.goto(`${BASE}/projects/${p.id}/estrategia`, {
        waitUntil: 'networkidle',
        timeout: 90_000,
      });
      status = res?.status() ?? null;
      await page.waitForTimeout(1800);

      const visible = await page.evaluate(() => document.body.innerText ?? '');
      const bajo = visible.toLowerCase();
      jerga = JERGA_VISIBLE.filter((j) => bajo.includes(j));

      // Los UUID solo pueden estar en el detalle de "reglas de la red", que va
      // dentro de un <details> cerrado. Si se ven en el texto plano, es un defecto.
      uuidsVisibles = (visible.match(new RegExp(RE_UUID, 'gi')) ?? []).length;
      cerosFeos = visible.match(new RegExp(RE_CEROS, 'g')) ?? [];

      // Lo que TIENE que estar para que la pantalla cumpla su promesa.
      const debe: Array<[string, RegExp]> = [
        ['el título de la sección', /Estrategia/i],
        ['la tarjeta del negocio', /El negocio/i],
        ['la tarjeta del mercado', /El mercado, medido/i],
        ['la tarjeta de públicos', /A quién le hablamos/i],
        ['la tarjeta del plan', /Qué se publica, dónde y para qué/i],
        ['el estado de la ficha', /Borrador|Confirmada por el dueño|Sin armar/i],
        ['la hipótesis de cada publicación', /La apuesta/i],
        ['el porqué de la métrica', /Por qué esa métrica/i],
      ];
      for (const [que, re] of debe) (re.test(visible) ? presentes : faltantes).push(que);

      // Si el proyecto tiene mediciones, cada una debe traer su cola completa.
      if (/El radar corrió|De dónde:/i.test(visible)) {
        for (const [que, re] of [
          ['de dónde salió cada cifra', /De dónde:/],
          ['cuándo se midió', /Cuándo:.*medido el/s],
          ['cómo se midió', /Cómo:/],
        ] as Array<[string, RegExp]>) {
          (re.test(visible) ? presentes : faltantes).push(que);
        }
      }
      // Y si no hay mediciones, tiene que DECIRLO en vez de dejar el hueco en blanco.
      if (/todavía no ha medido/i.test(visible)) presentes.push('dice que el radar no ha medido, en vez de dejarlo vacío');
      if (/no se inventa/i.test(visible)) presentes.push('dice que el precio no se sabe y que no se inventa');
    } catch (err) {
      erroresJs.push(`navegación: ${(err as Error).message.slice(0, 160)}`);
    }

    const archivo = path.join(SALIDA, `estrategia-${p.slug}-${t.nombre}.png`);
    await page.screenshot({ path: archivo, fullPage: true }).catch(() => undefined);
    resultados.push({
      pantalla: p.slug,
      tamano: t.nombre,
      status,
      erroresJs,
      jerga,
      uuidsVisibles,
      cerosFeos,
      archivo,
      presentes,
      faltantes,
    });

    const bien = status === 200 && !erroresJs.length && !jerga.length && !uuidsVisibles && !cerosFeos.length && !faltantes.length;
    console.log(
      `  ${bien ? '✓' : '✗'} ${p.slug} · ${t.nombre} · HTTP ${status ?? '?'} · ` +
        `${erroresJs.length} errores JS · ${jerga.length} jerga · ${uuidsVisibles} UUID · ` +
        `${cerosFeos.length} ceros feos · ${faltantes.length} faltantes`,
    );
    if (jerga.length) console.log(`      jerga: ${jerga.join(', ')}`);
    if (cerosFeos.length) console.log(`      ceros: ${cerosFeos.slice(0, 5).join(', ')}`);
    if (faltantes.length) console.log(`      falta: ${faltantes.join(' · ')}`);
    if (erroresJs.length) console.log(`      JS: ${erroresJs.slice(0, 3).join(' | ')}`);

    await context.close();
  }
}

async function limpiar(e: Escenario) {
  // Se borra el usuario de prueba y su org de Clerk. Los proyectos zz- SE QUEDAN:
  // son el escenario de la aceptación 1 y se reusan.
  await clerk(`/organizations/${e.orgClerkId}`, { method: 'DELETE' }).catch(() => undefined);
  await clerk(`/users/${e.clerkId}`, { method: 'DELETE' }).catch(() => undefined);
  await db.delete(projectMembers).where(eq(projectMembers.userId, e.userId)).catch(() => undefined);
  await db.delete(users).where(eq(users.id, e.userId)).catch(() => undefined);
}

async function main() {
  if (!CK) throw new Error('falta CLERK_SECRET_KEY en el entorno');
  mkdirSync(SALIDA, { recursive: true });

  const { webkit } = await import('playwright');
  console.log(`capturas de la Estrategia · WebKit · ${BASE}`);

  const e = await montar();
  console.log(`  sesión montada · ${e.proyectos.length} proyectos zz-`);

  const browser = await webkit.launch();
  try {
    for (const p of e.proyectos) await capturar(browser, e, p);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  writeFileSync(path.join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2));

  const malos = resultados.filter(
    (r) => r.status !== 200 || r.erroresJs.length || r.jerga.length || r.uuidsVisibles || r.cerosFeos.length || r.faltantes.length,
  );
  console.log('');
  console.log(`${resultados.length} capturas · ${malos.length} con defectos`);
  console.log(`carpeta: ${SALIDA}`);
  if (malos.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
