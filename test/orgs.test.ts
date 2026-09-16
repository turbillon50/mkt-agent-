/**
 * Pruebas de multitenant.
 *
 *   npx tsx test/orgs.test.ts                        (unitarias + base de datos)
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx test/orgs.test.ts   (+ HTTP)
 *
 * Lo que se prueba y por qué:
 *
 *  1. Firma Svix — es lo único que separa un webhook de Clerk de cualquiera que
 *     conozca la URL.
 *  2. Rol efectivo — `org:owner` se deriva del creador porque el plan gratuito
 *     de Clerk no deja crear roles (402 medido, ver src/orgs/types.ts).
 *  3. Migración 0013 — 0 filas sin `org_id` en las 12 tablas.
 *  4. AISLAMIENTO en la capa de datos — dos orgs de verdad, con proyectos y
 *     leads de verdad: ninguna consulta de la org A devuelve nada de la B.
 *  5. AISLAMIENTO Y 403 sobre HTTP — sesiones reales de Clerk contra el
 *     servidor construido. Es la prueba que vale: la que pasa por el middleware,
 *     por `apiOrg` y por los `where`.
 *
 * Todo lo que crea (2 usuarios, 2 orgs, sus proyectos y sus leads) se borra al
 * final, pase o falle.
 */
import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  actionQueue,
  campaigns,
  conversations,
  knowledge,
  messages,
  orgMemberships,
  organizations,
  planItems,
  posts,
  salesLeadEvents,
  salesLeads,
  socialAccounts,
  users,
  competitorLinks,
  leads as prospectLeads,
} from '../src/db/schema';
import { signSvix, verifySvix } from '../lib/svix';
import { isOrgPlan, isOrgStatus, resolveOrgRole } from '../src/orgs/types';
import { createProject, getProject, listProjects } from '../src/sales/projects';
import { ingestLead } from '../src/sales/ingest';
import { upsertOrg, upsertMembership } from '../src/orgs/repo';

// ---------------------------------------------------------------------------
// Arnés
// ---------------------------------------------------------------------------

let pasadas = 0;
const fallidas: string[] = [];

function check(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) {
    pasadas++;
  } else {
    fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
    console.error(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

function eq_(nombre: string, actual: unknown, esperado: unknown): void {
  check(nombre, Object.is(actual, esperado), `esperaba ${String(esperado)}, llegó ${String(actual)}`);
}

const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';
const BASE = (process.env.GOOSSIP_TEST_BASE_URL ?? '').replace(/\/$/, '');

async function clerk(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CLERK}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CK}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`clerk ${path} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Origen autorizado de la instancia. Se deduce del host de la Frontend API. */
const ORIGEN = (() => {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const fapi = Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
  return `https://${fapi.replace(/^clerk\./, '')}`;
})();

function host(fapi: string): string {
  return fapi.startsWith('http') ? fapi : `https://${fapi}`;
}

function frontendApi(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const b64 = pk.split('_')[2] ?? '';
  return Buffer.from(b64, 'base64').toString('utf8').replace(/\$$/, '');
}

// ---------------------------------------------------------------------------
// 1 · Firma Svix (webhook de Clerk)
// ---------------------------------------------------------------------------

function pruebaSvix(): void {
  console.log('\n— firma svix —');
  const secret = `whsec_${Buffer.from('llave-de-prueba-goossip-2026').toString('base64')}`;
  const body = JSON.stringify({ type: 'organization.created', data: { id: 'org_x' } });
  const id = 'msg_prueba';
  const ts = String(Math.floor(Date.now() / 1000));
  const firma = signSvix(body, id, ts, secret);

  check('firma buena pasa', verifySvix(body, { id, timestamp: ts, signature: firma }, secret).ok);

  const alterado = verifySvix(body + ' ', { id, timestamp: ts, signature: firma }, secret);
  check('cuerpo alterado se rechaza', !alterado.ok && alterado.reason === 'firma');

  const otraLlave = verifySvix(
    body,
    { id, timestamp: ts, signature: firma },
    `whsec_${Buffer.from('otra-llave-distinta').toString('base64')}`,
  );
  check('otra llave se rechaza', !otraLlave.ok && otraLlave.reason === 'firma');

  const viejo = verifySvix(body, { id, timestamp: '1000000000', signature: firma }, secret);
  check('timestamp viejo se rechaza (replay)', !viejo.ok && viejo.reason === 'timestamp');

  const sinCab = verifySvix(body, { id: null, timestamp: ts, signature: firma }, secret);
  check('sin cabeceras se rechaza', !sinCab.ok && sinCab.reason === 'faltan_cabeceras');

  const sinSecreto = verifySvix(body, { id, timestamp: ts, signature: firma }, undefined);
  check('sin CLERK_WEBHOOK_SECRET se rechaza', !sinSecreto.ok && sinSecreto.reason === 'sin_secreto');

  // Varias firmas durante rotación de llaves: basta con que una case.
  const rotacion = verifySvix(body, { id, timestamp: ts, signature: `v1,cGFwYXM= ${firma}` }, secret);
  check('acepta lista de firmas (rotación)', rotacion.ok);
}

// ---------------------------------------------------------------------------
// 2 · Rol efectivo
// ---------------------------------------------------------------------------

function pruebaRoles(): void {
  console.log('\n— rol efectivo —');
  eq_('el creador es org:owner aunque Clerk diga admin', resolveOrgRole('org:admin', 'u1', 'u1'), 'org:owner');
  eq_('otro admin se queda en org:admin', resolveOrgRole('org:admin', 'u2', 'u1'), 'org:admin');
  eq_('member se queda en member', resolveOrgRole('org:member', 'u2', 'u1'), 'org:member');
  eq_('rol desconocido cae a member', resolveOrgRole('org:loquesea', 'u2', 'u1'), 'org:member');
  eq_('sin rol en el token cae a member', resolveOrgRole(null, 'u2', 'u1'), 'org:member');
  check('plan válido', isOrgPlan('agency') && !isOrgPlan('platino'));
  check('estado válido', isOrgStatus('suspended') && !isOrgStatus('dormida'));
}

// ---------------------------------------------------------------------------
// 3 · Migración 0013
// ---------------------------------------------------------------------------

const TABLAS_CON_ORG = [
  'campaigns',
  'sales_leads',
  'sales_lead_events',
  'conversations',
  'messages',
  'action_queue',
  'social_accounts',
  'knowledge',
  'posts',
  'plan_items',
  'competitor_links',
  'leads',
] as const;

async function pruebaMigracion(): Promise<void> {
  console.log('\n— migración 0013 —');

  for (const t of TABLAS_CON_ORG) {
    const r = await db.execute(
      sql.raw(`select count(*)::int as n from ${t} where org_id is null`),
    );
    const n = Number((r as unknown as { rows: Array<{ n: number }> }).rows?.[0]?.n ?? 0);
    eq_(`${t}: 0 filas sin org_id`, n, 0);

    const nn = await db.execute(
      sql.raw(
        `select is_nullable from information_schema.columns where table_name='${t}' and column_name='org_id'`,
      ),
    );
    const nullable = (nn as unknown as { rows: Array<{ is_nullable: string }> }).rows?.[0]?.is_nullable;
    eq_(`${t}: org_id es NOT NULL`, nullable, 'NO');
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, 'all-global')).limit(1);
  check('existe la org all-global', Boolean(org));
  if (!org) return;

  const enOrg = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(eq(salesLeads.orgId, org.id));
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(salesLeads);
  eq_('todos los sales_leads están bajo all-global', enOrg[0]?.n, total[0]?.n);
  console.log(`    sales_leads bajo all-global: ${enOrg[0]?.n}/${total[0]?.n}`);

  const miembros = await db
    .select({ email: orgMemberships.email })
    .from(orgMemberships)
    .where(eq(orgMemberships.orgId, org.id));
  check(
    'turbillon50@gmail.com es miembro de all-global',
    miembros.some((m) => m.email === 'turbillon50@gmail.com'),
  );
  const dueno = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.clerkId, org.ownerUserId ?? ''))
    .limit(1);
  eq_('el dueño de all-global es turbillon50@gmail.com', dueno[0]?.email, 'turbillon50@gmail.com');
}

// ---------------------------------------------------------------------------
// Alta y baja del escenario de prueba
// ---------------------------------------------------------------------------

interface Actor {
  clerkId: string;
  userId: string;
  email: string;
  username: string;
  orgId: string;
  orgSlug: string;
  projectId: string;
  leadId: string;
  sessionId?: string;
  clientCookie?: string;
  /** JWT vigente y hasta cuándo sirve. Clerk lo emite con 60 s de vida. */
  jwt?: string;
  jwtHasta?: number;
}

const CREADOS: { users: string[]; orgs: string[] } = { users: [], orgs: [] };

async function crearActor(sufijo: string, nombreOrg: string): Promise<Actor> {
  const username = `goossip_qa_${sufijo}_${Date.now().toString(36)}`;
  const email = `${username}@vforge.site`;

  const u = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      username,
      password: `Qa-Goossip-2026-${sufijo}A!x`,
      skip_password_checks: true,
    }),
  });
  CREADOS.users.push(u.id);

  const orgSlug = `qa-${sufijo}-${Date.now().toString(36)}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: nombreOrg, slug: orgSlug, created_by: u.id }),
  });
  CREADOS.orgs.push(o.id);

  // Fila en `users`: fuera de una petición no corre `getOrCreateUser`.
  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, isAdmin: false })
    .onConflictDoNothing()
    .returning();
  const dbUser =
    row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];

  await upsertOrg({ id: o.id, name: nombreOrg, slug: orgSlug, ownerUserId: u.id });
  await upsertMembership({
    id: `qa:${o.id}:${u.id}`,
    orgId: o.id,
    clerkUserId: u.id,
    email,
    role: 'org:admin',
  });

  const project = await createProject(o.id, dbUser.id, {
    name: `Proyecto ${nombreOrg}`,
    kind: 'servicios',
    sellerPersona: `Vendedor de prueba de ${nombreOrg}.`,
  });

  const ingest = await ingestLead({
    project,
    fullName: `Lead ${nombreOrg}`,
    phone: sufijo === 'alfa' ? '+5215500000001' : '+5215500000002',
    email: null,
    source: 'manual',
    sourceRef: `qa-${sufijo}`,
    createdAt: new Date(),
    skipLookup: true,
    skipQueue: true,
    raw: { prueba: true },
  });

  return {
    clerkId: u.id,
    userId: dbUser.id,
    email,
    username,
    orgId: o.id,
    orgSlug,
    projectId: project.id,
    leadId: ingest.lead.id,
  };
}

async function limpiar(actores: Actor[]): Promise<void> {
  console.log('\n— limpieza —');
  const orgIds = actores.map((a) => a.orgId).filter(Boolean);

  if (orgIds.length > 0) {
    // En orden de dependencia. `messages` y `sales_lead_events` cuelgan de
    // conversaciones y leads, así que van primero. Ninguna falla individual
    // detiene la limpieza: dejar basura a medias es peor.
    const tablas = [
      ['messages', messages.orgId],
      ['sales_lead_events', salesLeadEvents.orgId],
      ['action_queue', actionQueue.orgId],
      ['conversations', conversations.orgId],
      ['sales_leads', salesLeads.orgId],
      ['social_accounts', socialAccounts.orgId],
      ['knowledge', knowledge.orgId],
      ['posts', posts.orgId],
      ['plan_items', planItems.orgId],
      ['competitor_links', competitorLinks.orgId],
      ['leads', prospectLeads.orgId],
      ['campaigns', campaigns.orgId],
    ] as const;
    const tabla = {
      messages,
      sales_lead_events: salesLeadEvents,
      action_queue: actionQueue,
      conversations,
      sales_leads: salesLeads,
      social_accounts: socialAccounts,
      knowledge,
      posts,
      plan_items: planItems,
      competitor_links: competitorLinks,
      leads: prospectLeads,
      campaigns,
    } as const;
    for (const [nombre, col] of tablas) {
      await db
        .delete(tabla[nombre as keyof typeof tabla] as never)
        .where(inArray(col, orgIds))
        .catch((e) => console.error(`    limpieza de ${nombre}: ${e instanceof Error ? e.message : e}`));
    }
    await db
      .delete(organizations)
      .where(inArray(organizations.id, orgIds)) // arrastra membresías por FK
      .catch((e) => console.error(`    limpieza de organizations: ${e instanceof Error ? e.message : e}`));
  }

  for (const a of actores) {
    if (a.userId) await db.delete(users).where(eq(users.id, a.userId)).catch(() => undefined);
  }
  for (const id of CREADOS.orgs) {
    await clerk(`/organizations/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  for (const id of CREADOS.users) {
    await clerk(`/users/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  console.log(`    borrados: ${CREADOS.orgs.length} orgs y ${CREADOS.users.length} usuarios de Clerk`);
}

// ---------------------------------------------------------------------------
// 4 · Aislamiento en la capa de datos
// ---------------------------------------------------------------------------

async function pruebaAislamientoDatos(a: Actor, b: Actor): Promise<void> {
  console.log('\n— aislamiento (capa de datos) —');

  const proyectosA = await listProjects(a.orgId);
  const proyectosB = await listProjects(b.orgId);
  eq_('A ve exactamente 1 proyecto', proyectosA.length, 1);
  eq_('B ve exactamente 1 proyecto', proyectosB.length, 1);
  check('A no ve el proyecto de B', !proyectosA.some((p) => p.id === b.projectId));
  check('B no ve el proyecto de A', !proyectosB.some((p) => p.id === a.projectId));

  check('getProject de A con id de B devuelve null', (await getProject(a.orgId, b.projectId)) === null);
  check('getProject de B con id de A devuelve null', (await getProject(b.orgId, a.projectId)) === null);

  const { pipeline, ownedLead, queueForOrg, ownedAction, leadTimeline } = await import('../src/sales/queries');

  const pipeA = await pipeline(a.orgId, a.projectId);
  eq_('el pipeline de A trae su lead', pipeA.length, 1);
  const pipeCruzado = await pipeline(a.orgId, b.projectId);
  eq_('el pipeline de A con el proyecto de B viene vacío', pipeCruzado.length, 0);

  check('ownedLead de A con el lead de B devuelve null', (await ownedLead(a.orgId, b.leadId)) === null);
  check('ownedLead de A con su lead sí resuelve', (await ownedLead(a.orgId, a.leadId)) !== null);

  const tlCruzado = await leadTimeline(a.orgId, b.leadId);
  eq_('la bitácora de A con el lead de B viene vacía', tlCruzado.events.length, 0);
  const tlPropia = await leadTimeline(a.orgId, a.leadId);
  check('la bitácora de A con su lead trae eventos', tlPropia.events.length > 0);

  // Una acción en la cola de B: A no la ve ni la puede aprobar.
  const { enqueue } = await import('../src/sales/queue');
  const accionB = await enqueue({
    orgId: b.orgId,
    campaignId: b.projectId,
    leadId: b.leadId,
    kind: 'notify_owner',
    reason: 'prueba de aislamiento',
    status: 'pending',
    createdBy: 'test',
  });
  check('se encoló una acción en B', accionB !== null);
  if (accionB) {
    const colaA = await queueForOrg(a.orgId, ['pending']);
    check('la cola de A no trae la acción de B', !colaA.some((r) => r.action.id === accionB.id));
    const colaB = await queueForOrg(b.orgId, ['pending']);
    check('la cola de B sí trae su acción', colaB.some((r) => r.action.id === accionB.id));
    check('ownedAction de A con la acción de B devuelve null', (await ownedAction(a.orgId, accionB.id)) === null);
    check('ownedAction de B con su acción sí resuelve', (await ownedAction(b.orgId, accionB.id)) !== null);
  }

  // Slug repetido: es único POR ORG, no global. Dos orgs pueden tener el mismo.
  const { uniqueSlug } = await import('../src/sales/projects');
  const slugA = proyectosA[0]?.slug ?? '';
  const enOtraOrg = await uniqueSlug(b.orgId, slugA);
  eq_('el mismo slug se puede repetir en otra org', enOtraOrg, slugA);
}

// ---------------------------------------------------------------------------
// 5 · Aislamiento y 403 sobre HTTP, con sesiones reales
// ---------------------------------------------------------------------------

async function abrirSesion(actor: Actor): Promise<void> {
  const fapi = frontendApi();
  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: actor.clerkId, expires_in_seconds: 900 }),
  });

  const res = await fetch(`${host(fapi)}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // La Frontend API exige un origen autorizado: es el mismo `azp` que
      // acaba en el JWT. Sin esto contesta 400 y la sesión no nace.
      Origin: ORIGEN,
    },
    body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
  });
  const body = await res.json();
  const cookie = (res.headers.get('set-cookie') ?? '').match(/__client=([^;]+)/)?.[1];
  actor.sessionId = body?.client?.sessions?.[0]?.id;
  actor.clientCookie = cookie;
  if (!actor.sessionId || !cookie) {
    throw new Error(
      `no se pudo abrir sesión de prueba (${res.status}): ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
}

/**
 * JWT vigente de la sesión.
 *
 * Clerk lo emite con 60 s de vida, así que se refresca solo cuando faltan menos
 * de 15 s. Pedirlo en cada petición hace que la Frontend API conteste
 * `too_many_requests` (medido) y la prueba se cae sola.
 */
async function tokenFresco(actor: Actor): Promise<string> {
  if (actor.jwt && actor.jwtHasta && Date.now() < actor.jwtHasta) return actor.jwt;
  const fapi = frontendApi();
  const res = await fetch(
    `${host(fapi)}/v1/client/sessions/${actor.sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `__client=${actor.clientCookie}`,
        Origin: ORIGEN,
      },
      body: new URLSearchParams({ active_organization_id: actor.orgId }),
    },
  );
  const body = await res.json();
  const s = body?.response ?? body;
  const jwt = s?.last_active_token?.jwt;
  if (!jwt) throw new Error(`sin jwt: ${JSON.stringify(body).slice(0, 200)}`);
  actor.jwt = jwt;
  actor.jwtHasta = Date.now() + 45_000;
  return jwt;
}

async function pedir(
  actor: Actor,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const jwt = await tokenFresco(actor);
  // Se manda como `Authorization: Bearer` y no como cookie `__session`: la
  // cookie viene de otro dominio y Clerk contesta con su handshake (307), que
  // taparía el código real de la ruta. MEDIDO: con Bearer, /api/projects da 200
  // y /api/admin/orgs da 403; con cookie ambos daban 307.
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { Authorization: `Bearer ${jwt}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, body };
}

async function pruebaHttp(a: Actor, b: Actor): Promise<void> {
  console.log('\n— aislamiento y 403 (HTTP, sesiones reales) —');
  await abrirSesion(a);
  await abrirSesion(b);

  // --- lo propio sí se ve --------------------------------------------------
  const propiosA = await pedir(a, '/api/projects');
  eq_('A · GET /api/projects → 200', propiosA.status, 200);
  eq_('A · ve 1 proyecto', propiosA.body?.projects?.length, 1);
  eq_('A · el proyecto es el suyo', propiosA.body?.projects?.[0]?.id, a.projectId);
  eq_('A · la org del payload es la suya', propiosA.body?.org?.id, a.orgId);

  const propiosB = await pedir(b, '/api/projects');
  eq_('B · ve 1 proyecto', propiosB.body?.projects?.length, 1);
  eq_('B · el proyecto es el suyo', propiosB.body?.projects?.[0]?.id, b.projectId);

  // --- lo ajeno NO se ve ---------------------------------------------------
  const cruzProyecto = await pedir(a, `/api/projects/${b.projectId}`);
  eq_('A · GET el proyecto de B → 404', cruzProyecto.status, 404);

  const cruzLead = await pedir(a, `/api/sales/leads/${b.leadId}`);
  eq_('A · GET el lead de B → 404', cruzLead.status, 404);

  const patchAjeno = await pedir(a, `/api/projects/${b.projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'secuestrado' }),
  });
  eq_('A · PATCH el proyecto de B → 404', patchAjeno.status, 404);

  const leadsA = await pedir(a, '/api/sales/leads');
  eq_('A · GET /api/sales/leads → 200', leadsA.status, 200);
  eq_('A · ve 1 lead', leadsA.body?.leads?.length, 1);
  check(
    'A · no ve el lead de B en su pipeline',
    !(leadsA.body?.leads ?? []).some((l: any) => l.id === b.leadId),
  );

  const colaA = await pedir(a, '/api/queue');
  eq_('A · GET /api/queue → 200', colaA.status, 200);
  check(
    'A · su cola no trae acciones de B',
    !(colaA.body?.actions ?? []).some((x: any) => x.orgId === b.orgId),
  );

  // Que el nombre del proyecto de B no aparezca en NINGUNA respuesta de A.
  const nombreB = `Proyecto QA Beta`;
  const todo = JSON.stringify([propiosA.body, leadsA.body, colaA.body]);
  check('A · ninguna respuesta menciona el proyecto de B', !todo.includes(nombreB));

  // --- /admin: 403 para quien no es dueño de la app ------------------------
  const adminOrgs = await pedir(a, '/api/admin/orgs');
  eq_('A (no admin) · GET /api/admin/orgs → 403', adminOrgs.status, 403);
  const adminUsers = await pedir(a, '/api/admin/users');
  eq_('A (no admin) · GET /api/admin/users → 403', adminUsers.status, 403);
  const adminQueue = await pedir(a, '/api/admin/queue');
  eq_('A (no admin) · GET /api/admin/queue → 403', adminQueue.status, 403);
  const adminHealth = await pedir(a, '/api/admin/health');
  eq_('A (no admin) · GET /api/admin/health → 403', adminHealth.status, 403);
  const adminOrgAjena = await pedir(a, `/api/admin/orgs/${b.orgId}`);
  eq_('A (no admin) · GET /api/admin/orgs/<org de B> → 403', adminOrgAjena.status, 403);
  const adminBorrar = await pedir(a, `/api/admin/orgs/${b.orgId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: b.orgSlug }),
  });
  eq_('A (no admin) · DELETE la org de B → 403', adminBorrar.status, 403);

  const paginaAdmin = await pedir(a, '/admin');
  check(
    'A (no admin) · la página /admin lo saca a /dashboard',
    paginaAdmin.status === 307 || paginaAdmin.status === 302,
    `status ${paginaAdmin.status}`,
  );

  // --- el mismo usuario, ahora SÍ admin: la puerta debe abrir --------------
  // Sin esto el 403 no probaría nada: podría estar negando siempre.
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, a.userId));
  const adminOk = await pedir(a, '/api/admin/orgs');
  eq_('A (ya admin) · GET /api/admin/orgs → 200', adminOk.status, 200);
  check(
    'A (ya admin) · sí ve la org de B — /admin está por encima de las orgs',
    (adminOk.body?.orgs ?? []).some((o: any) => o.id === b.orgId),
  );
  const borrarSinConfirmar = await pedir(a, `/api/admin/orgs/${b.orgId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'lo-que-sea' }),
  });
  eq_('A (ya admin) · DELETE sin escribir el slug → 400', borrarSinConfirmar.status, 400);
  await db.update(users).set({ isAdmin: false }).where(eq(users.id, a.userId));

  // --- sin sesión ----------------------------------------------------------
  const anon = await fetch(`${BASE}/api/projects`, { redirect: 'manual' });
  check(
    'sin sesión · /api/projects no devuelve datos',
    anon.status !== 200,
    `status ${anon.status}`,
  );

  // --- org suspendida ------------------------------------------------------
  await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, a.orgId));
  const suspendida = await pedir(a, '/api/projects');
  eq_('org suspendida · /api/projects → 403', suspendida.status, 403);
  eq_('org suspendida · el motivo es explícito', suspendida.body?.problem, 'org_suspended');
  await db.update(organizations).set({ status: 'active' }).where(eq(organizations.id, a.orgId));
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  pruebaSvix();
  pruebaRoles();
  await pruebaMigracion();

  if (!CK) {
    console.log('\n(sin CLERK_SECRET_KEY: se omiten las pruebas de aislamiento)');
  } else {
    const actores: Actor[] = [];
    try {
      console.log('\n— montando dos organizaciones de prueba —');
      const a = await crearActor('alfa', 'QA Alfa');
      actores.push(a);
      const b = await crearActor('beta', 'QA Beta');
      actores.push(b);
      console.log(`    A: ${a.orgSlug} (${a.orgId})`);
      console.log(`    B: ${b.orgSlug} (${b.orgId})`);

      await pruebaAislamientoDatos(a, b);

      if (BASE) {
        await pruebaHttp(a, b);
      } else {
        console.log('\n(sin GOOSSIP_TEST_BASE_URL: se omiten las pruebas por HTTP)');
      }
    } finally {
      await limpiar(actores);
      const quedan = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(campaigns)
        .where(
          and(
            inArray(
              campaigns.orgId,
              actores.map((x) => x.orgId).filter(Boolean).length > 0
                ? actores.map((x) => x.orgId)
                : ['__ninguna__'],
            ),
          ),
        );
      eq_('no quedó basura de las orgs de prueba', quedan[0]?.n, 0);
    }
  }

  console.log(`\n${pasadas} pruebas pasadas, ${fallidas.length} fallidas`);
  if (fallidas.length > 0) {
    for (const f of fallidas) console.error(` · ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
