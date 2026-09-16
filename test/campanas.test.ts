/**
 * Pruebas de la corrida 4: campañas en plural y el menú lateral nuevo.
 *
 *   npx tsx test/campanas.test.ts                                   (unitarias + base)
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx test/campanas.test.ts   (+ HTTP)
 *
 * Qué se prueba y por qué:
 *
 *  1. Saneado de la entrada — un presupuesto negativo, fechas al revés o un
 *     nombre repetido son errores de dedo que tienen que contestarse en
 *     español, no reventar contra un índice único.
 *  2. La migración 0015 — la tabla, sus columnas y, sobre todo, que la llave
 *     foránea del lead sea `SET NULL`: borrar una campaña NO puede llevarse los
 *     leads que trajo.
 *  3. Atribución — el lead de Meta se cuelga de la campaña que tiene ESE
 *     formulario, y de ninguna si nadie lo reclama. Inventarle una campaña
 *     arruinaría el único número que la sección existe para dar.
 *  4. Aislamiento — una campaña de otro proyecto no se lee, no se edita y no se
 *     borra, ni siquiera con el id correcto en la mano.
 *  5. El menú lateral — que "Nueva campaña" NO viva ahí, que lo que se pidió
 *     quitar esté quitado, y que la zona de navegación sea UNA caja con scroll.
 *  6. HTTP con sesiones reales — la prueba que vale: la que pasa por el
 *     middleware, por `apiProject` y por los `where`.
 *
 * Todo lo que crea se borra al final, pase o falle.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  actionQueue,
  campaigns,
  conversations,
  marketingCampaigns,
  orgMemberships,
  organizations,
  projectEvents,
  projectMembers,
  salesLeadEvents,
  salesLeads,
  socialAccounts,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { ingestLead } from '../src/sales/ingest';
import { upsertProjectMember } from '../src/projects/members';
import { projectBadges } from '../src/projects/badges';
import {
  attributeLead,
  campaignCount,
  campaignCounts,
  campaignForForm,
  CampaignError,
  campaignLeads,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from '../src/marketing/campaigns';
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  isCampaignObjective,
  isCampaignStatus,
} from '../src/marketing/types';

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

/** Espera que la promesa reviente con un mensaje en español, no con un 500. */
async function revienta(nombre: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(nombre, false, 'no reventó');
  } catch (e) {
    check(
      nombre,
      e instanceof CampaignError && /[a-záéíóúñ]{4}/i.test(e.message),
      e instanceof Error ? e.message : String(e),
    );
  }
}

const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';
const BASE = (process.env.GOOSSIP_TEST_BASE_URL ?? '').replace(/\/$/, '');

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
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`clerk ${ruta} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function frontendApi(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  return Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
}
const ORIGEN = `https://${frontendApi().replace(/^clerk\./, '')}`;

// ---------------------------------------------------------------------------
// 1 · El menú lateral, leído del código
// ---------------------------------------------------------------------------

/**
 * Esto NO sustituye a mirar las capturas. Fija las decisiones que se pidieron
 * por escrito para que la próxima corrida no las deshaga sin darse cuenta.
 */
function pruebaMenu(): void {
  console.log('\n— menú lateral —');
  const raiz = path.resolve('.');
  const sidebar = readFileSync(path.join(raiz, 'components/sidebar.tsx'), 'utf8');
  const nav = readFileSync(path.join(raiz, 'components/project-nav.tsx'), 'utf8');
  const shell = readFileSync(path.join(raiz, 'components/app-shell.tsx'), 'utf8');

  /**
   * Se barre el código SIN comentarios. Los comentarios de estos archivos
   * explican justamente qué se quitó y por qué — "el botón gigante de Nuevo
   * chat se fue" — y una prueba que se tropieza con su propia explicación no
   * está midiendo nada.
   */
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  const menu = `${sinComentarios(sidebar)}\n${sinComentarios(nav)}`;

  // --- lo que se pidió QUITAR ------------------------------------------------
  for (const fuera of ['Nuevo chat', 'Redes conectadas', 'Mi organización']) {
    eq_(`el menú ya no dice "${fuera}"`, menu.includes(fuera), false);
  }
  eq_('el menú no tiene etiqueta PRO', /['">\s]PRO['"<\s]/.test(menu), false);

  // --- la jerarquía ----------------------------------------------------------
  eq_('el botón del menú es "Nuevo proyecto"', menu.includes('Nuevo proyecto'), true);
  eq_('"Nueva campaña" NO vive en el menú', /Nueva campa[ñn]a/.test(menu), false);
  eq_(
    '"Nueva campaña" vive en la sección Campañas',
    readFileSync(path.join(raiz, 'components/marketing/campaigns-board.tsx'), 'utf8').includes(
      'Nueva campaña',
    ),
    true,
  );

  // --- UN solo scroll --------------------------------------------------------
  // El bug era una caja de altura fija con su propio overflow. El menú entero
  // mide 100dvh y SOLO la zona de navegación crece y scrollea.
  eq_('el menú mide 100dvh en escritorio', sidebar.includes('lg:h-[100dvh]'), true);
  eq_('la cabecera no crece', sidebar.includes('shrink-0'), true);
  const navLimpio = sinComentarios(nav);
  const zonaNav = navLimpio.slice(navLimpio.indexOf('<nav'), navLimpio.indexOf('</nav>'));
  eq_('la zona de navegación crece con lo que sobra', zonaNav.includes('flex-1'), true);
  eq_('…y puede encogerse (min-h-0)', zonaNav.includes('min-h-0'), true);
  eq_('…y tiene EL scroll', zonaNav.includes('overflow-y-auto'), true);
  eq_(
    'sin alturas fijas ni máximas dentro de la navegación',
    /\b(max-h-|h-\[\d)/.test(zonaNav),
    false,
  );
  // El desplegable de proyectos sí tiene su propio scroll, y está bien: flota
  // FUERA del flujo. Si estuviera dentro, volvería a comerse la navegación.
  const desplegable = nav.slice(nav.indexOf('absolute left-0 right-0 top-full'));
  eq_('el desplegable de proyectos flota, no empuja', desplegable.startsWith('absolute'), true);

  // --- ancho y plegado -------------------------------------------------------
  const prefs = readFileSync(path.join(raiz, 'components/sidebar-prefs.tsx'), 'utf8');
  eq_('el ancho mínimo es 200', prefs.includes('SIDEBAR_MIN = 200'), true);
  eq_('el ancho máximo es 320', prefs.includes('SIDEBAR_MAX = 320'), true);
  eq_('plegado son 64 px', prefs.includes('SIDEBAR_COLLAPSED = 64'), true);
  eq_('el ancho se guarda', prefs.includes("localStorage.setItem(KEY_WIDTH"), true);
  eq_('el plegado se guarda', prefs.includes('localStorage.setItem(KEY_COLLAPSED'), true);
  eq_('el ancho manda en el aside', shell.includes('lg:w-[var(--aside-w)]'), true);
  eq_('y se aplica antes del primer pintado', shell.includes('SIDEBAR_BOOT'), true);

  // --- el móvil no se toca ---------------------------------------------------
  eq_('la barra de abajo sigue montada', shell.includes('<BottomTabBar'), true);
  eq_('y sigue siendo solo de celular', readFileSync(path.join(raiz, 'components/bottom-tab-bar.tsx'), 'utf8').includes('lg:hidden'), true);
  eq_('el cajón de celular conserva su ancho fijo', shell.includes('w-72 max-w-[85vw]'), true);
}

// ---------------------------------------------------------------------------
// 2 · Saneado de la entrada
// ---------------------------------------------------------------------------

function pruebaCatalogos(): void {
  console.log('\n— catálogos de campaña —');
  eq_('5 objetivos', CAMPAIGN_OBJECTIVES.length, 5);
  eq_('4 estados', CAMPAIGN_STATUSES.length, 4);
  eq_('nace en borrador', CAMPAIGN_STATUSES[0], 'borrador');
  eq_('un objetivo inventado no pasa', isCampaignObjective('vender_mucho'), false);
  eq_('un estado inventado no pasa', isCampaignStatus('encendida'), false);
  eq_('objetivos y estados en español', CAMPAIGN_OBJECTIVES.includes('leads' as never), true);
}

// ---------------------------------------------------------------------------
// 3 · Migración 0015
// ---------------------------------------------------------------------------

async function pruebaMigracion(): Promise<void> {
  console.log('\n— migración 0015 —');

  const tabla = await db.execute(
    sql`SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='marketing_campaigns'`,
  );
  eq_('existe marketing_campaigns', (tabla.rows[0] as { c: number }).c, 1);

  const cols = await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='marketing_campaigns'`,
  );
  const nombres = new Set(cols.rows.map((r) => (r as { column_name: string }).column_name));
  for (const c of [
    'org_id',
    'project_id',
    'name',
    'objective',
    'status',
    'channels',
    'budget',
    'meta_refs',
    'starts_at',
    'ends_at',
  ]) {
    eq_(`marketing_campaigns.${c}`, nombres.has(c), true);
  }

  const lead = await db.execute(
    sql`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_leads' AND column_name='marketing_campaign_id'`,
  );
  eq_('sales_leads.marketing_campaign_id es opcional', (lead.rows[0] as { is_nullable: string })?.is_nullable, 'YES');

  // La que de verdad importa: borrar una campaña NO se lleva sus leads.
  const fk = await db.execute(sql`
    SELECT rc.delete_rule FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name='sales_leads' AND tc.constraint_type='FOREIGN KEY'
      AND tc.constraint_name LIKE '%marketing%'`);
  eq_('borrar la campaña NO borra sus leads', (fk.rows[0] as { delete_rule: string })?.delete_rule, 'SET NULL');

  // Y la de la campaña contra el proyecto sí es en cascada: una campaña sin
  // proyecto no significa nada.
  const fkProyecto = await db.execute(sql`
    SELECT rc.delete_rule FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name='marketing_campaigns' AND tc.constraint_type='FOREIGN KEY'`);
  eq_('borrar el proyecto sí borra sus campañas', (fkProyecto.rows[0] as { delete_rule: string })?.delete_rule, 'CASCADE');
}

// ---------------------------------------------------------------------------
// Escenario
// ---------------------------------------------------------------------------

interface Persona {
  clerkId: string;
  userId: string;
  email: string;
}

interface Escenario {
  orgId: string;
  dueno: Persona;
  editor: Persona;
  conector: Persona;
  proyectoA: string;
  proyectoB: string;
}

const CREADOS = { orgs: [] as string[], users: [] as string[] };

async function crearUsuario(rol: string): Promise<Persona> {
  const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const username = `goossip_c4_${rol}_${sufijo}`;
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
  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, isAdmin: false })
    .onConflictDoNothing()
    .returning();
  const dbUser = row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];
  return { clerkId: u.id, userId: dbUser.id, email };
}

async function montarEscenario(): Promise<Escenario> {
  const dueno = await crearUsuario('dueno');
  const editor = await crearUsuario('editor');
  const conector = await crearUsuario('conector');

  const slug = `qa-c4-${Date.now().toString(36)}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'QA Corrida 4', slug, created_by: dueno.clerkId }),
  });
  CREADOS.orgs.push(o.id);
  for (const p of [editor, conector]) {
    await clerk(`/organizations/${o.id}/memberships`, {
      method: 'POST',
      body: JSON.stringify({ user_id: p.clerkId, role: 'org:member' }),
    });
  }

  await upsertOrg({ id: o.id, name: 'QA Corrida 4', slug, ownerUserId: dueno.clerkId });
  await upsertMembership({
    id: `qa4:${o.id}:${dueno.clerkId}`,
    orgId: o.id,
    clerkUserId: dueno.clerkId,
    email: dueno.email,
    role: 'org:admin',
  });
  for (const p of [editor, conector]) {
    await upsertMembership({
      id: `qa4:${o.id}:${p.clerkId}`,
      orgId: o.id,
      clerkUserId: p.clerkId,
      email: p.email,
      role: 'org:member',
    });
  }

  const a = await createProject(
    o.id,
    dueno.userId,
    { name: 'Proyecto A', kind: 'real_estate', sellerPersona: 'Vendedor del proyecto A de prueba.' },
    { clerkUserId: dueno.clerkId, email: dueno.email },
  );
  const b = await createProject(
    o.id,
    dueno.userId,
    { name: 'Proyecto B', kind: 'servicios', sellerPersona: 'Vendedor del proyecto B de prueba.' },
    { clerkUserId: dueno.clerkId, email: dueno.email },
  );

  await upsertProjectMember({
    orgId: o.id,
    projectId: a.id,
    clerkUserId: editor.clerkId,
    email: editor.email,
    role: 'editor',
    status: 'activo',
    invitedBy: dueno.clerkId,
  });
  await upsertProjectMember({
    orgId: o.id,
    projectId: a.id,
    clerkUserId: conector.clerkId,
    email: conector.email,
    role: 'conector',
    status: 'activo',
    invitedBy: dueno.clerkId,
  });

  return { orgId: o.id, dueno, editor, conector, proyectoA: a.id, proyectoB: b.id };
}

// ---------------------------------------------------------------------------
// 4 · El repositorio de campañas
// ---------------------------------------------------------------------------

async function pruebaRepositorio(e: Escenario): Promise<void> {
  console.log('\n— campañas en la base —');
  const { orgId, proyectoA: A, proyectoB: B } = e;

  eq_('proyecto nuevo: 0 campañas', await campaignCount(orgId, A), 0);

  const verano = await createCampaign(
    orgId,
    A,
    {
      name: 'Preventa Tulum',
      objective: 'leads',
      status: 'activa',
      channels: ['meta', 'meta', 'inventado' as never],
      budget: 15000,
      metaRefs: { form_ids: ['2146578942620117', '2146578942620117'], basura: 'x' } as never,
      startsAt: '2026-09-01',
      endsAt: '2026-09-30',
    },
    e.dueno.clerkId,
  );
  eq_('la campaña se creó', Boolean(verano.id), true);
  eq_('los canales repetidos se colapsan', verano.channels.length, 1);
  eq_('y el canal inventado se cae', verano.channels[0], 'meta');
  eq_('los formularios repetidos se colapsan', verano.metaRefs.form_ids?.length, 1);
  eq_('las llaves que no son nuestras se caen', 'basura' in verano.metaRefs, false);
  eq_('el presupuesto llega a la base como numeric', verano.budget, '15000.00');

  // --- lo que NO se acepta ---------------------------------------------------
  await revienta('nombre de una letra', () =>
    createCampaign(orgId, A, { name: 'x' }, e.dueno.clerkId),
  );
  await revienta('nombre repetido en el mismo proyecto', () =>
    createCampaign(orgId, A, { name: 'preventa tulum' }, e.dueno.clerkId),
  );
  await revienta('presupuesto negativo', () =>
    createCampaign(orgId, A, { name: 'Con deuda', budget: -5 }, e.dueno.clerkId),
  );
  await revienta('termina antes de empezar', () =>
    createCampaign(
      orgId,
      A,
      { name: 'Al revés', startsAt: '2026-10-01', endsAt: '2026-09-01' },
      e.dueno.clerkId,
    ),
  );

  // El MISMO nombre en OTRO proyecto sí se puede: son dos negocios distintos.
  const enB = await createCampaign(orgId, B, { name: 'Preventa Tulum' }, e.dueno.clerkId);
  eq_('el mismo nombre en otro proyecto sí se puede', Boolean(enB.id), true);

  // --- aislamiento -----------------------------------------------------------
  eq_('la campaña del B no se lee desde el A', await getCampaign(orgId, A, enB.id), null);
  eq_('ni se edita', await updateCampaign(orgId, A, enB.id, { status: 'activa' }), null);
  eq_('ni se borra', await deleteCampaign(orgId, A, enB.id), false);
  eq_('y sigue viva', Boolean(await getCampaign(orgId, B, enB.id)), true);
  eq_('un id que ni es uuid contesta "no existe"', await getCampaign(orgId, A, 'a-la-verga'), null);
  eq_('desde otra org tampoco', await getCampaign('org_inventada', A, verano.id), null);

  // --- edición ---------------------------------------------------------------
  const pausada = await updateCampaign(orgId, A, verano.id, { status: 'pausada' });
  eq_('se pausa', pausada?.status, 'pausada');
  await revienta('no se le puede poner un estado inventado', () =>
    updateCampaign(orgId, A, verano.id, { status: 'encendida' as never }),
  );
  const sinPresupuesto = await updateCampaign(orgId, A, verano.id, { budget: null });
  eq_('el presupuesto se puede vaciar', sinPresupuesto?.budget, null);
  await updateCampaign(orgId, A, verano.id, { budget: 15000, status: 'activa' });
}

// ---------------------------------------------------------------------------
// 5 · Atribución
// ---------------------------------------------------------------------------

async function pruebaAtribucion(e: Escenario): Promise<void> {
  console.log('\n— atribución de leads —');
  const { orgId, proyectoA: A } = e;
  const proyecto = (await db.select().from(campaigns).where(eq(campaigns.id, A)).limit(1))[0];

  const [verano] = await db
    .select()
    .from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.projectId, A), eq(marketingCampaigns.name, 'Preventa Tulum')));

  // El formulario de la campaña la encuentra; uno ajeno, no.
  eq_('el formulario encuentra su campaña', await campaignForForm(orgId, A, '2146578942620117'), verano.id);
  eq_('un formulario ajeno no inventa campaña', await campaignForForm(orgId, A, '999999'), null);
  eq_('sin formulario no hay campaña', await campaignForForm(orgId, A, null), null);
  eq_('desde otro proyecto tampoco', await campaignForForm(orgId, e.proyectoB, '2146578942620117'), null);

  // Tres leads: dos de la campaña, uno del formulario del sitio.
  const conCampana = await Promise.all(
    ['Ana de la pauta', 'Jorge de la pauta'].map((nombre, i) =>
      ingestLead({
        project: proyecto,
        fullName: nombre,
        phone: `+521550000010${i}`,
        email: null,
        source: 'meta_leadgen',
        sourceRef: `qa-c4-pauta-${i}`,
        marketingCampaignId: verano.id,
        createdAt: new Date(),
        skipLookup: true,
        skipQueue: true,
      }),
    ),
  );
  const suelto = await ingestLead({
    project: proyecto,
    fullName: 'Marisol del sitio',
    phone: '+5215500000199',
    email: null,
    source: 'site',
    sourceRef: 'qa-c4-sitio',
    createdAt: new Date(),
    skipLookup: true,
    skipQueue: true,
  });

  eq_('el lead de la pauta trae su campaña', conCampana[0].lead.marketingCampaignId, verano.id);
  eq_('el lead del sitio no trae ninguna', suelto.lead.marketingCampaignId, null);

  const conteo = await campaignCounts(orgId, A, verano.id);
  eq_('la campaña cuenta 2 leads', conteo.total, 2);
  eq_('los 2 están sin contactar', conteo.nuevos, 2);

  const lista = await listCampaigns(orgId, A);
  const enLista = lista.find((c) => c.id === verano.id);
  eq_('la lista trae el mismo número', enLista?.leads, 2);
  eq_('y el presupuesto ya como número', enLista?.budget, 15000);
  eq_('las campañas sin leads salen en cero, no sin dato', lista.every((c) => typeof c.leads === 'number'), true);

  // Amarrar a mano un lead que entró suelto.
  eq_('un lead suelto se puede atribuir', await attributeLead(orgId, A, suelto.lead.id, verano.id), true);
  eq_('y la campaña ya cuenta 3', (await campaignCounts(orgId, A, verano.id)).total, 3);
  const [delB] = await db
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.projectId, e.proyectoB))
    .limit(1);
  await revienta('no se puede atribuir a una campaña de otro proyecto', () =>
    attributeLead(orgId, A, suelto.lead.id, delB.id),
  );
  eq_('y se puede soltar otra vez', await attributeLead(orgId, A, suelto.lead.id, null), true);
  eq_('la campaña vuelve a 2', (await campaignCounts(orgId, A, verano.id)).total, 2);

  eq_('los leads de la campaña se leen', (await campaignLeads(orgId, A, verano.id)).length, 2);

  // --- EL caso que tenía que quedar bien -------------------------------------
  // Borrar la campaña no se lleva a la gente que trajo.
  const antes = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(and(eq(salesLeads.orgId, orgId), eq(salesLeads.campaignId, A)));
  eq_('se borra la campaña', await deleteCampaign(orgId, A, verano.id), true);
  const despues = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(and(eq(salesLeads.orgId, orgId), eq(salesLeads.campaignId, A)));
  eq_('y los leads siguen ahí', despues[0].c, antes[0].c);
  const huerfanos = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, orgId),
        eq(salesLeads.campaignId, A),
        sql`${salesLeads.marketingCampaignId} IS NULL`,
      ),
    );
  eq_('…y se quedaron sin campaña, no colgados de una que ya no existe', huerfanos[0].c, despues[0].c);
}

// ---------------------------------------------------------------------------
// 6 · Los números del menú
// ---------------------------------------------------------------------------

async function pruebaBadges(e: Escenario): Promise<void> {
  console.log('\n— números del menú —');
  const proyecto = (await db.select().from(campaigns).where(eq(campaigns.id, e.proyectoA)).limit(1))[0];
  const badges = await projectBadges(proyecto);

  const leadsNuevos = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, e.orgId),
        eq(salesLeads.campaignId, e.proyectoA),
        eq(salesLeads.stage, 'nuevo'),
      ),
    );
  eq_('el badge de Leads es el count(*) real', badges.leads, leadsNuevos[0].c);
  check('y no es cero de adorno', badges.leads > 0, `leads=${badges.leads}`);
  eq_('sin conversaciones, cero', badges.conversaciones, 0);
  eq_('sin acciones pendientes, cero', badges.automatizaciones, 0);

  // Sin un solo canal conectado, el punto de Conexiones está en rojo.
  eq_('proyecto sin canales: punto rojo', badges.conexiones.estado, 'rojo');
  eq_('y lo dice con números', badges.conexiones.conectados, 0);
  check('hay canales que sí se pueden conectar', badges.conexiones.conectables > 0, '');

  // El proyecto B está vacío: todos sus badges en cero, y cero se muestra como
  // cero (el menú decide no pintarlo, pero el dato no se inventa).
  const b = (await db.select().from(campaigns).where(eq(campaigns.id, e.proyectoB)).limit(1))[0];
  const badgesB = await projectBadges(b);
  eq_('proyecto vacío: 0 leads', badgesB.leads, 0);
}

// ---------------------------------------------------------------------------
// 7 · HTTP con sesiones reales
// ---------------------------------------------------------------------------

interface Sesion {
  clerkId: string;
  orgId: string;
  sessionId?: string;
  clientCookie?: string;
  jwt?: string;
  jwtHasta?: number;
}

async function abrirSesion(s: Sesion): Promise<void> {
  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: s.clerkId, expires_in_seconds: 900 }),
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
  s.sessionId = body?.client?.sessions?.[0]?.id;
  s.clientCookie = (res.headers.get('set-cookie') ?? '').match(/__client=([^;]+)/)?.[1];
  if (!s.sessionId || !s.clientCookie) {
    throw new Error(`no se pudo abrir sesión (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
}

async function tokenFresco(s: Sesion): Promise<string> {
  if (s.jwt && s.jwtHasta && Date.now() < s.jwtHasta) return s.jwt;
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sessions/${s.sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `__client=${s.clientCookie}`,
        Origin: ORIGEN,
      },
      body: new URLSearchParams({ active_organization_id: s.orgId }),
    },
  );
  const body = await res.json();
  const jwt = (body?.response ?? body)?.last_active_token?.jwt;
  if (!jwt) throw new Error(`sin jwt: ${JSON.stringify(body).slice(0, 200)}`);
  s.jwt = jwt;
  s.jwtHasta = Date.now() + 45_000;
  return jwt;
}

/**
 * `Authorization: Bearer` y no la cookie `__session`. MEDIDO en la corrida 2:
 * con cookie desde otro dominio, Clerk contesta con su handshake (307) y eso
 * taparía el código real de la ruta.
 */
async function pedir(s: Sesion, ruta: string, init: RequestInit = {}) {
  const jwt = await tokenFresco(s);
  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    redirect: 'manual',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
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

async function pruebaHttp(e: Escenario): Promise<void> {
  console.log('\n— HTTP con sesiones reales —');
  const dueno: Sesion = { clerkId: e.dueno.clerkId, orgId: e.orgId };
  const editor: Sesion = { clerkId: e.editor.clerkId, orgId: e.orgId };
  const conector: Sesion = { clerkId: e.conector.clerkId, orgId: e.orgId };
  await abrirSesion(dueno);
  await abrirSesion(editor);
  await abrirSesion(conector);

  const A = e.proyectoA;
  const B = e.proyectoB;

  // --- el dueño hace de todo -------------------------------------------------
  const lista = await pedir(dueno, `/api/projects/${A}/campanas`);
  eq_('dueño · lista de campañas', lista.status, 200);
  eq_('dueño · puede editar', lista.body?.puedeEditar, true);

  const creada = await pedir(dueno, `/api/projects/${A}/campanas`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Remarketing octubre',
      objective: 'mensajes',
      channels: ['meta', 'whatsapp'],
      budget: 8000,
    }),
  });
  eq_('dueño · crea campaña', creada.status, 200);
  eq_('…con sus canales', creada.body?.campana?.channels?.length, 2);
  eq_('…y nace en borrador', creada.body?.campana?.status, 'borrador');
  const campanaId = creada.body?.campana?.id as string;

  const repetida = await pedir(dueno, `/api/projects/${A}/campanas`, {
    method: 'POST',
    body: JSON.stringify({ name: 'remarketing OCTUBRE' }),
  });
  eq_('nombre repetido · 400', repetida.status, 400);
  check('…y lo dice en español', /ya tienes/i.test(String(repetida.body?.error)), String(repetida.body?.error));

  const detalle = await pedir(dueno, `/api/projects/${A}/campanas/${campanaId}`);
  eq_('dueño · detalle de la campaña', detalle.status, 200);
  eq_('…con sus leads (todavía ninguno)', detalle.body?.leads?.length, 0);

  // --- el editor opera pero no borra ----------------------------------------
  eq_('editor · ve las campañas', (await pedir(editor, `/api/projects/${A}/campanas`)).status, 200);
  const editorCrea = await pedir(editor, `/api/projects/${A}/campanas`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Campaña del editor' }),
  });
  eq_('editor · SÍ crea campañas', editorCrea.status, 200);
  eq_(
    'editor · SÍ pausa una campaña',
    (
      await pedir(editor, `/api/projects/${A}/campanas/${campanaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pausada' }),
      })
    ).status,
    200,
  );
  const editorBorra = await pedir(editor, `/api/projects/${A}/campanas/${campanaId}`, {
    method: 'DELETE',
  });
  eq_('editor · NO borra campañas', editorBorra.status, 403);
  eq_('…y le dicen por qué', editorBorra.body?.problem, 'project_role');
  eq_('…y la campaña sigue viva', Boolean(await getCampaign(e.orgId, A, campanaId)), true);

  // --- el conector ni las ve -------------------------------------------------
  const conectorLista = await pedir(conector, `/api/projects/${A}/campanas`);
  eq_('conector · NO ve las campañas', conectorLista.status, 403);
  eq_('…y le dicen por qué', conectorLista.body?.problem, 'project_role');
  eq_(
    'conector · tampoco crea',
    (
      await pedir(conector, `/api/projects/${A}/campanas`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Nada' }),
      })
    ).status,
    403,
  );
  eq_(
    'conector · tampoco ve el detalle',
    (await pedir(conector, `/api/projects/${A}/campanas/${campanaId}`)).status,
    403,
  );

  // --- una campaña no se cruza de proyecto -----------------------------------
  eq_(
    'la campaña del A no existe desde el B',
    (await pedir(dueno, `/api/projects/${B}/campanas/${campanaId}`)).status,
    404,
  );
  eq_(
    'ni se pausa desde el B',
    (
      await pedir(dueno, `/api/projects/${B}/campanas/${campanaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'activa' }),
      })
    ).status,
    404,
  );

  // --- los badges del menú ---------------------------------------------------
  const badges = await pedir(dueno, `/api/projects/${A}/badges`);
  eq_('dueño · badges del proyecto', badges.status, 200);
  check('…con números de verdad', typeof badges.body?.badges?.leads === 'number', JSON.stringify(badges.body).slice(0, 120));
  eq_(
    'los badges de un proyecto ajeno no salen',
    (await pedir(conector, `/api/projects/${B}/badges`)).status,
    403,
  );

  // --- la ruta vieja de alta también deja dueño ------------------------------
  // Era un agujero real, medido en la base: `/api/campaigns` daba de alta el
  // PROYECTO por su propio camino y lo dejaba sin fila de dueño y sin bitácora.
  const viejo = await pedir(dueno, '/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name: `Proyecto por la ruta vieja ${Date.now().toString(36)}` }),
  });
  eq_('ruta vieja · crea proyecto', viejo.status, 200);
  const nuevoId = viejo.body?.campaign?.id as string;
  const suDueno = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, nuevoId), eq(projectMembers.role, 'dueño')));
  eq_('…y ese proyecto SÍ nace con dueño', suDueno.length, 1);
  eq_('…y es quien lo creó', suDueno[0]?.clerkUserId, e.dueno.clerkId);
  const suBitacora = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, nuevoId));
  eq_('…y queda en la bitácora', suBitacora.length, 1);

  // El dueño sí borra, y ahí sí se va.
  eq_(
    'dueño · SÍ borra',
    (await pedir(dueno, `/api/projects/${A}/campanas/${campanaId}`, { method: 'DELETE' })).status,
    200,
  );
  eq_('…y ya no está', await getCampaign(e.orgId, A, campanaId), null);
}

// ---------------------------------------------------------------------------

async function limpiar(e: Escenario | null): Promise<void> {
  console.log('\n— limpieza —');
  if (e) {
    const paso = async (nombre: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        console.error(`  ! no se pudo limpiar ${nombre}: ${(err as Error).message}`);
      }
    };
    await paso('sales_lead_events', () => db.delete(salesLeadEvents).where(eq(salesLeadEvents.orgId, e.orgId)));
    await paso('action_queue', () => db.delete(actionQueue).where(eq(actionQueue.orgId, e.orgId)));
    await paso('conversations', () => db.delete(conversations).where(eq(conversations.orgId, e.orgId)));
    await paso('sales_leads', () => db.delete(salesLeads).where(eq(salesLeads.orgId, e.orgId)));
    await paso('marketing_campaigns', () => db.delete(marketingCampaigns).where(eq(marketingCampaigns.orgId, e.orgId)));
    await paso('project_events', () => db.delete(projectEvents).where(eq(projectEvents.orgId, e.orgId)));
    await paso('project_members', () => db.delete(projectMembers).where(eq(projectMembers.orgId, e.orgId)));
    await paso('social_accounts', () => db.delete(socialAccounts).where(eq(socialAccounts.orgId, e.orgId)));
    await paso('campaigns', () => db.delete(campaigns).where(eq(campaigns.orgId, e.orgId)));
    await paso('org_memberships', () => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
    await paso('organizations', () => db.delete(organizations).where(eq(organizations.id, e.orgId)));
  }
  for (const id of CREADOS.orgs) {
    await clerk(`/organizations/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  for (const id of CREADOS.users) {
    await clerk(`/users/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await db.delete(users).where(eq(users.clerkId, id)).catch(() => undefined);
  }
  console.log(`  borrado: ${CREADOS.orgs.length} orgs y ${CREADOS.users.length} usuarios de Clerk`);
}

async function main(): Promise<void> {
  console.log('PRUEBAS · GOOSSIP CORRIDA 4 — campañas en plural y el menú nuevo');

  pruebaMenu();
  pruebaCatalogos();
  await pruebaMigracion();

  let escenario: Escenario | null = null;
  try {
    if (!CK) {
      console.log('\n(sin CLERK_SECRET_KEY: no se montan usuarios de verdad)');
    } else {
      escenario = await montarEscenario();
      await pruebaRepositorio(escenario);
      await pruebaAtribucion(escenario);
      await pruebaBadges(escenario);
      if (BASE) {
        await pruebaHttp(escenario);
      } else {
        console.log('\n(sin GOOSSIP_TEST_BASE_URL: no se prueba por HTTP)');
      }
    }
  } finally {
    await limpiar(escenario);
  }

  console.log(`\n${pasadas} pasadas, ${fallidas.length} fallidas`);
  if (fallidas.length > 0) {
    for (const f of fallidas) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
