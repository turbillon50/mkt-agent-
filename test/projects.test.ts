/**
 * Pruebas del PROYECTO como unidad central (corrida 3).
 *
 *   npx tsx test/projects.test.ts                      (unitarias + base)
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx test/projects.test.ts   (+ HTTP)
 *
 * Lo que se prueba y por qué:
 *
 *  1. Roles y secciones — el `conector` solo ve Conexiones. Es la regla que
 *     protege los leads del cliente de la persona que solo vino a enganchar un
 *     Facebook.
 *  2. Enlace de conexión — un solo uso, 72 h, y deja escrito quién lo quemó.
 *     Un enlace reutilizable es una llave de la casa por WhatsApp.
 *  3. Migración 0014 — las tres tablas nuevas, y ningún proyecto sin dueño.
 *  4. Aislamiento ENTRE PROYECTOS de la misma org — la corrida 2 aisló orgs;
 *     esto aísla un piso más abajo.
 *  5. Cero notas internas — barrido del texto que ve el usuario contra una
 *     lista negra de jerga de desarrollo.
 *  6. HTTP con sesiones reales — la prueba que vale: la que pasa por el
 *     middleware, por `apiProject` y por los `where`.
 *
 * Todo lo que crea se borra al final, pase o falle.
 */
import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  actionQueue,
  campaigns,
  connectionLinks,
  conversations,
  knowledge,
  messages,
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
import { createProject, getProject } from '../src/sales/projects';
import { ingestLead } from '../src/sales/ingest';
import {
  createConnectionLink,
  hashToken,
  linkState,
  redeemConnectionLink,
  resolveConnectionLink,
  revokeConnectionLink,
} from '../src/projects/links';
import {
  projectRoleFor,
  projectsForUser,
  removeProjectMember,
  setProjectMemberRole,
  upsertProjectMember,
} from '../src/projects/members';
import { buildChannelCards, channelAvailable } from '../src/projects/connections';
import {
  canSeeSection,
  CONNECTORS,
  landingSection,
  projectCan,
  PROJECT_ROLES,
  PROJECT_SECTIONS,
  type ProjectRole,
} from '../src/projects/types';

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
// 1 · Roles, secciones y capacidades
// ---------------------------------------------------------------------------

function pruebaRoles(): void {
  console.log('\n— roles del proyecto —');

  // El conector es el caso que importa: entra a enganchar un canal y no tiene
  // por qué ver los leads de nadie.
  const prohibidasAlConector = PROJECT_SECTIONS.filter((s) => s !== 'conexiones');
  eq_(
    'conector: solo ve Conexiones',
    prohibidasAlConector.every((s) => !canSeeSection('conector', s)),
    true,
  );
  eq_('conector: sí ve Conexiones', canSeeSection('conector', 'conexiones'), true);
  eq_('conector: aterriza en Conexiones', landingSection('conector'), 'conexiones');

  eq_('dueño: ve todo', PROJECT_SECTIONS.every((s) => canSeeSection('dueño', s)), true);
  eq_('editor: no ve Equipo', canSeeSection('editor', 'equipo'), false);
  eq_('editor: no ve Ajustes', canSeeSection('editor', 'ajustes'), false);
  eq_('editor: sí ve Leads', canSeeSection('editor', 'leads'), true);
  eq_('lector: sí ve Leads', canSeeSection('lector', 'leads'), true);
  eq_('lector: no ve Equipo', canSeeSection('lector', 'equipo'), false);

  eq_('solo el dueño administra', PROJECT_ROLES.filter((r) => projectCan(r, 'administrar')).join(), 'dueño');
  eq_(
    'conectan dueño y conector',
    PROJECT_ROLES.filter((r) => projectCan(r, 'conectar')).join(),
    'dueño,conector',
  );
  eq_('el conector NO opera leads', projectCan('conector', 'operar'), false);
  eq_('el lector no cambia nada', projectCan('lector', 'operar'), false);
}

// ---------------------------------------------------------------------------
// 2 · Cero notas internas
// ---------------------------------------------------------------------------

/**
 * Jerga que el usuario nunca tiene que leer. Esto no es estilo: "falta
 * registrar el auth config en Composio" le dice a un cliente que le vendimos
 * algo a medias.
 */
const JERGA = [
  'auth config',
  'auth_config',
  'bridge',
  'baileys',
  'app de developer',
  'developer app',
  'variable de entorno',
  'env de vercel',
  'webhook',
  'phase ',
  'en configuración',
  'soon',
  'hardcode',
  'deprecated',
  'placeholder',
];

/**
 * `/admin` es la consola de Luis como dueño de Goossip, no la app del cliente.
 * Ahí "webhook" es la palabra correcta: es lo que está mirando. La regla de
 * cero notas internas es para lo que ve el CLIENTE.
 */
const FUERA_DEL_BARRIDO = ['components/admin/', 'app/(dashboard)/admin/'];

/**
 * Texto que de verdad lee alguien: los nodos de JSX y los textos de los
 * atributos. Sacarlo con expresiones regulares sobre el código fuente trae
 * basura — `=>` abre un falso ">" y arrastra medio archivo hasta el siguiente
 * "<" — así que cada candidato pasa por un filtro de "esto parece prosa".
 */
function pareceProsa(t: string): boolean {
  const s = t.trim();
  if (s.length < 4) return false;
  if (/[{}$`_=;()[\]|&#@\\]/.test(s)) return false;
  if (s.includes('=>') || s.includes('//')) return false;
  if (!/[a-záéíóúñ]{3}/i.test(s)) return false;
  return true;
}

function textoVisible(fuente: string): string {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const trozos: string[] = [];
  for (const m of sinComentarios.matchAll(/>([^<>]*)</g)) {
    if (pareceProsa(m[1])) trozos.push(m[1]);
  }
  for (const m of sinComentarios.matchAll(
    /(?:placeholder|title|aria-label|label|ayuda|help|description|texto|titulo)[:=]\s*["'`]([^"'`]+)["'`]/g,
  )) {
    if (pareceProsa(m[1])) trozos.push(m[1]);
  }
  return trozos.join(' \n ');
}

function archivosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...archivosTsx(full));
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function pruebaSinJerga(): void {
  console.log('\n— cero notas internas —');
  const raiz = path.resolve('.');
  const archivos = [
    ...archivosTsx(path.join(raiz, 'app')),
    ...archivosTsx(path.join(raiz, 'components')),
  ].filter((f) => !FUERA_DEL_BARRIDO.some((x) => path.relative(raiz, f).includes(x)));

  const encontradas: string[] = [];
  for (const archivo of archivos) {
    const visible = textoVisible(readFileSync(archivo, 'utf8')).toLowerCase();
    for (const palabra of JERGA) {
      if (visible.includes(palabra)) {
        encontradas.push(`${path.relative(raiz, archivo)} → "${palabra}"`);
      }
    }
  }

  check(
    `${archivos.length} pantallas del cliente sin jerga de desarrollo`,
    encontradas.length === 0,
    encontradas.slice(0, 8).join(' · '),
  );

  /**
   * "Composio" dejó de ser jerga en la corrida 5 y pasó a ser el nombre de un
   * proveedor que el usuario VE — Luis lo dictó así: "Al conectar verás una
   * pantalla de permisos de Composio, nuestro proveedor de conexiones seguras."
   * Lo que sigue prohibido es explicarle la maquinaria. Por eso el barrido no
   * cuenta la palabra: exige que cada vez que aparece venga con esa frase y en
   * un solo lugar.
   */
  const conComposio = archivos
    .map((f) => ({ ruta: path.relative(raiz, f), texto: textoVisible(readFileSync(f, 'utf8')) }))
    .filter((a) => /composio/i.test(a.texto));
  check(
    'Composio solo se nombra como proveedor, una vez y sin explicar la maquinaria',
    conComposio.length <= 1 &&
      // El texto llega envuelto por el formateo del JSX: los espacios y saltos
      // se comparan como uno solo, que es como lo lee una persona.
      conComposio.every((a) => /proveedor\s+de\s+conexiones\s+seguras/i.test(a.texto)),
    conComposio.map((a) => a.ruta).join(' · '),
  );

  // Y ninguna marca de trabajo a medias, en mayúsculas, en ningún lado.
  const pendientes = [...archivosTsx(path.join(raiz, 'app')), ...archivosTsx(path.join(raiz, 'components'))]
    .filter((f) => /\b(TODO|FIXME|XXX|HACK)\b:/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(raiz, f));
  check('sin marcas de pendiente en el código de pantallas', pendientes.length === 0, pendientes.join(' · '));

  // El catálogo de canales es lo que más se lee: se revisa aparte y entero.
  const textoCanales = CONNECTORS.map((c) => `${c.label} ${c.blurb}`).join(' ').toLowerCase();
  check(
    'el catálogo de canales habla en español de a pie',
    !JERGA.some((j) => textoCanales.includes(j.toLowerCase())),
    textoCanales.slice(0, 120),
  );
}

// ---------------------------------------------------------------------------
// 3 · Estado de los canales
// ---------------------------------------------------------------------------

function pruebaCanales(): void {
  console.log('\n— canales —');

  const proyecto = {
    id: 'p1',
    orgId: 'o1',
    slug: 'proyecto-de-prueba',
    channels: {},
    mcpSources: [],
    rules: {},
  } as any;

  const { cards, conectados, conectables } = buildChannelCards(proyecto, []);
  // Corrida 5: el catálogo es el de Composio (21) más los tres propios de
  // Goossip. Meta con app propia solo aparece con `META_OWN_APP=true`.
  eq_('el catálogo tiene los 24 conectores', cards.length, CONNECTORS.length);
  eq_('la publicidad va primero, por valor', cards[0].group, 'publicidad');
  eq_('proyecto nuevo: 0 conectados', conectados, 0);
  check('hay canales conectables de verdad', conectables >= 3, `conectables=${conectables}`);
  eq_(
    'un solo sistema de etiquetas',
    cards.every((c) =>
      ['conectado', 'sin_conectar', 'reconectar', 'proximamente'].includes(c.state),
    ),
    true,
  );
  eq_(
    'lo que no está disponible dice Próximamente',
    cards.filter((c) => !channelAvailable(c.id)).every((c) => c.state === 'proximamente'),
    true,
  );
  eq_(
    'ninguna tarjeta sin conectar inventa un detalle',
    cards.filter((c) => c.state !== 'conectado').every((c) => c.detail === null),
    true,
  );

  // El camino viejo de Meta con app propia no se borró: se apagó. Con la
  // bandera encendida sigue funcionando igual que en la corrida 3, y apagada
  // ni siquiera aparece en el catálogo.
  eq_('con META_OWN_APP apagado, Meta con app propia no está', cards.some((c) => c.id === 'meta'), false);
  const antes = process.env.META_OWN_APP;
  process.env.META_OWN_APP = 'true';

  // Meta con página pero SIN formulario: conectado a medias, y se dice.
  const conPagina = buildChannelCards(
    { ...proyecto, channels: { meta_page_id: '1173019489236259' } } as any,
    [
      {
        platform: 'meta',
        status: 'connected',
        metadata: { page_id: '1173019489236259', page_name: 'V&living', forms: [] },
        connectedBy: 'user_x',
        connectedAt: new Date(),
        label: 'V&living',
      } as any,
    ],
  );
  const meta = conPagina.cards.find((c) => c.id === 'meta')!;
  eq_('Meta con página: conectado', meta.state, 'conectado');
  eq_('Meta con página: dice el nombre real', meta.detail, 'V&living');
  check('Meta sin formulario: avisa qué falta', Boolean(meta.pending), 'no avisó');
  if (antes === undefined) delete process.env.META_OWN_APP;
  else process.env.META_OWN_APP = antes;

  // WhatsApp con número pero sin permiso para escribir: NO se pinta de verde.
  const conNumero = buildChannelCards(
    { ...proyecto, channels: { waba_phone_id: '123456789012345' } } as any,
    [],
  );
  const wa = conNumero.cards.find((c) => c.id === 'whatsapp')!;
  eq_('WhatsApp a medias no dice Conectado', wa.state, 'sin_conectar');
  check('WhatsApp a medias explica qué falta', Boolean(wa.pending), 'no avisó');
}

// ---------------------------------------------------------------------------
// 4 · Migración 0014
// ---------------------------------------------------------------------------

/** El driver de Neon devuelve `{ rows: [...] }`; se desenvuelve en un solo sitio. */
async function filas<T = Record<string, any>>(query: string): Promise<T[]> {
  const r = await db.execute(sql.raw(query));
  return ((r as unknown as { rows?: T[] }).rows ?? (r as unknown as T[])) as T[];
}

async function pruebaMigracion(): Promise<void> {
  console.log('\n— migración 0014 —');

  for (const tabla of ['project_members', 'connection_links', 'project_events']) {
    const r = await filas(
      `select 1 as x from information_schema.tables where table_schema='public' and table_name='${tabla}'`,
    );
    eq_(`existe ${tabla}`, r.length, 1);
  }

  for (const col of ['website', 'city', 'country']) {
    const r = await filas(
      `select 1 as x from information_schema.columns where table_name='campaigns' and column_name='${col}'`,
    );
    eq_(`campaigns.${col}`, r.length, 1);
  }

  const nullable = await filas<{ is_nullable: string }>(
    `select is_nullable from information_schema.columns where table_name='social_accounts' and column_name='user_id'`,
  );
  eq_('social_accounts.user_id quedó opcional', nullable[0]?.is_nullable, 'YES');

  // Ningún proyecto sin dueño: es el invariante que hace que Equipo funcione.
  const huerfanos = await filas(`
    select c.id from campaigns c
    where not exists (
      select 1 from project_members m where m.project_id = c.id and m.role = 'dueño'
    )
  `);
  eq_('proyectos sin dueño', huerfanos.length, 0);

  // Una conexión por (proyecto, canal): el índice parcial de la 0014.
  const duplicadas = await filas(`
    select campaign_id, platform, count(*) c
    from social_accounts where campaign_id is not null
    group by campaign_id, platform having count(*) > 1
  `);
  eq_('conexiones duplicadas por proyecto', duplicadas.length, 0);
}

// ---------------------------------------------------------------------------
// 5 · Enlaces de conexión
// ---------------------------------------------------------------------------

async function pruebaEnlaces(orgId: string, projectId: string, quemadorId: string): Promise<void> {
  console.log('\n— enlace de conexión —');

  const { link, token } = await createConnectionLink({
    orgId,
    projectId,
    channel: 'meta',
    createdBy: 'user_creador',
  });

  eq_('el token en claro NO queda en la base', link.tokenHash === token, false);
  eq_('en la base vive el sha256', link.tokenHash, hashToken(token));
  check('largo del token >= 40', token.length >= 40, `largo=${token.length}`);

  const horas = (link.expiresAt.getTime() - link.createdAt.getTime()) / 3600_000;
  check('dura 72 horas', Math.abs(horas - 72) < 0.1, `duró ${horas.toFixed(2)} h`);

  // Abrirlo no lo gasta: un prefetch del navegador lo dejaría inservible.
  const mirada = await resolveConnectionLink(token);
  eq_('mirarlo no lo quema', mirada.ok, true);
  const otraMirada = await resolveConnectionLink(token);
  eq_('mirarlo dos veces tampoco', otraMirada.ok, true);

  const primero = await redeemConnectionLink(token, quemadorId);
  eq_('primer uso: sirve', primero.ok, true);
  eq_('deja escrito quién lo usó', primero.ok ? primero.link.usedBy : null, quemadorId);
  check('deja escrito cuándo', primero.ok && primero.link.usedAt !== null);

  const segundo = await redeemConnectionLink(token, 'user_colado');
  eq_('segundo uso: rebota', segundo.ok, false);
  eq_('y dice que ya se usó', segundo.ok ? '' : segundo.problem, 'usado');

  const enBase = await db
    .select()
    .from(connectionLinks)
    .where(eq(connectionLinks.id, link.id))
    .limit(1);
  eq_('no lo pisó el segundo intento', enBase[0].usedBy, quemadorId);

  // Expiración: se crea uno nacido hace cuatro días.
  const hace4Dias = new Date(Date.now() - 4 * 24 * 3600_000);
  const viejo = await createConnectionLink({
    orgId,
    projectId,
    channel: 'meta',
    createdBy: 'user_creador',
    now: hace4Dias,
  });
  const caduco = await resolveConnectionLink(viejo.token);
  eq_('uno de hace 4 días: caducado', caduco.ok ? '' : caduco.problem, 'expirado');
  eq_('y no se puede quemar', (await redeemConnectionLink(viejo.token, quemadorId)).ok, false);
  eq_('el panel lo muestra como expirado', linkState(viejo.link), 'expirado');

  // Cancelar antes de que lo usen.
  const cancelable = await createConnectionLink({
    orgId,
    projectId,
    channel: 'meta',
    createdBy: 'user_creador',
  });
  await revokeConnectionLink(orgId, projectId, cancelable.link.id);
  const cancelado = await resolveConnectionLink(cancelable.token);
  eq_('cancelado: ya no sirve', cancelado.ok ? '' : cancelado.problem, 'cancelado');

  // Un token inventado no abre nada.
  const inventado = await resolveConnectionLink('token-que-alguien-se-inventó-ahorita-mismo');
  eq_('token inventado: no existe', inventado.ok ? '' : inventado.problem, 'no_existe');
}

// ---------------------------------------------------------------------------
// 6 · Aislamiento entre proyectos de la MISMA organización
// ---------------------------------------------------------------------------

interface Escenario {
  orgId: string;
  orgSlug: string;
  dueno: { clerkId: string; userId: string; email: string };
  invitado: { clerkId: string; userId: string; email: string };
  proyectoA: string;
  proyectoB: string;
  leadA: string;
  leadB: string;
}

const CREADOS: { users: string[]; orgs: string[] } = { users: [], orgs: [] };

async function crearUsuario(sufijo: string): Promise<{ clerkId: string; userId: string; email: string }> {
  const username = `goossip_c3_${sufijo}_${Date.now().toString(36)}`;
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
  const invitado = await crearUsuario('conector');

  const slug = `qa-c3-${Date.now().toString(36)}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'QA Corrida 3', slug, created_by: dueno.clerkId }),
  });
  CREADOS.orgs.push(o.id);
  await clerk(`/organizations/${o.id}/memberships`, {
    method: 'POST',
    body: JSON.stringify({ user_id: invitado.clerkId, role: 'org:member' }),
  });

  await upsertOrg({ id: o.id, name: 'QA Corrida 3', slug, ownerUserId: dueno.clerkId });
  await upsertMembership({
    id: `qa3:${o.id}:${dueno.clerkId}`,
    orgId: o.id,
    clerkUserId: dueno.clerkId,
    email: dueno.email,
    role: 'org:admin',
  });
  await upsertMembership({
    id: `qa3:${o.id}:${invitado.clerkId}`,
    orgId: o.id,
    clerkUserId: invitado.clerkId,
    email: invitado.email,
    role: 'org:member',
  });

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

  const leadA = await ingestLead({
    project: a,
    fullName: 'Lead del A',
    phone: '+5215500000011',
    email: null,
    source: 'manual',
    sourceRef: 'qa-c3-a',
    createdAt: new Date(),
    skipLookup: true,
    skipQueue: true,
  });
  const leadB = await ingestLead({
    project: b,
    fullName: 'Lead del B',
    phone: '+5215500000012',
    email: null,
    source: 'manual',
    sourceRef: 'qa-c3-b',
    createdAt: new Date(),
    skipLookup: true,
    skipQueue: true,
  });

  // El invitado entra SOLO al proyecto A, y solo como conector.
  await upsertProjectMember({
    orgId: o.id,
    projectId: a.id,
    clerkUserId: invitado.clerkId,
    email: invitado.email,
    role: 'conector',
    status: 'activo',
    invitedBy: dueno.clerkId,
  });

  return {
    orgId: o.id,
    orgSlug: slug,
    dueno,
    invitado,
    proyectoA: a.id,
    proyectoB: b.id,
    leadA: leadA.lead.id,
    leadB: leadB.lead.id,
  };
}

async function pruebaAislamientoDatos(e: Escenario): Promise<void> {
  console.log('\n— aislamiento entre proyectos (capa de datos) —');

  const delDueno = await projectsForUser(e.orgId, e.dueno.clerkId, 'org:admin');
  eq_('el dueño ve sus 2 proyectos', delDueno.length, 2);
  eq_('y manda en los dos', delDueno.every((p) => p.role === 'dueño'), true);

  const delInvitado = await projectsForUser(e.orgId, e.invitado.clerkId, 'org:member');
  eq_('el invitado ve UN proyecto', delInvitado.length, 1);
  eq_('y es el A', delInvitado[0]?.project.id, e.proyectoA);
  eq_('con rol conector', delInvitado[0]?.role, 'conector');
  eq_(
    'el proyecto B ni aparece',
    delInvitado.some((p) => p.project.id === e.proyectoB),
    false,
  );

  eq_(
    'rol del invitado en A',
    (await projectRoleFor(e.orgId, e.proyectoA, e.invitado.clerkId, 'org:member'))?.role,
    'conector',
  );
  eq_(
    'rol del invitado en B: ninguno',
    await projectRoleFor(e.orgId, e.proyectoB, e.invitado.clerkId, 'org:member'),
    null,
  );
  eq_(
    'el org:admin hereda dueño sin fila propia',
    (await projectRoleFor(e.orgId, e.proyectoB, e.dueno.clerkId, 'org:admin'))?.inherited,
    true,
  );

  // Un id de proyecto de otra org no se resuelve ni con el org correcto.
  eq_('proyecto de otra org: null', await getProject('org_inventada', e.proyectoA), null);

  // Cambio de rol y baja.
  const miembros = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, e.proyectoA), eq(projectMembers.clerkUserId, e.invitado.clerkId)));
  const cambiado = await setProjectMemberRole(e.orgId, e.proyectoA, miembros[0].id, 'lector');
  eq_('cambiar rol', cambiado?.role, 'lector');
  eq_(
    'con el nuevo rol ya no conecta',
    projectCan((cambiado?.role ?? 'lector') as ProjectRole, 'conectar'),
    false,
  );
  await setProjectMemberRole(e.orgId, e.proyectoA, miembros[0].id, 'conector');

  // Sacarlo desde OTRO proyecto no lo saca: el `where` lleva project_id.
  eq_('no se puede sacar desde otro proyecto', await removeProjectMember(e.orgId, e.proyectoB, miembros[0].id), null);
  const sigue = await projectRoleFor(e.orgId, e.proyectoA, e.invitado.clerkId, 'org:member');
  eq_('y sigue adentro del A', sigue?.role, 'conector');
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
  const fapi = frontendApi();
  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: s.clerkId, expires_in_seconds: 900 }),
  });
  const res = await fetch(
    `https://${fapi}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
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

/** Clerk emite el JWT con 60 s de vida; se refresca solo cuando falta poco. */
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
 * Se manda `Authorization: Bearer` y no la cookie `__session`. MEDIDO en la
 * corrida 2: con cookie desde otro dominio, Clerk contesta con su handshake
 * (307) y eso taparía el código real de la ruta.
 */
async function pedir(s: Sesion, ruta: string, init: RequestInit = {}) {
  const jwt = await tokenFresco(s);
  const res = await fetch(`${BASE}${ruta}`, {
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

async function pruebaHttp(e: Escenario): Promise<void> {
  console.log('\n— HTTP con sesiones reales —');
  const dueno: Sesion = { clerkId: e.dueno.clerkId, orgId: e.orgId };
  const conector: Sesion = { clerkId: e.invitado.clerkId, orgId: e.orgId };
  await abrirSesion(dueno);
  await abrirSesion(conector);

  // --- el dueño hace de todo -----------------------------------------------
  const lista = await pedir(dueno, '/api/projects');
  eq_('dueño · /api/projects', lista.status, 200);
  eq_('dueño · ve sus 2 proyectos', lista.body?.projects?.length, 2);

  eq_('dueño · conexiones del A', (await pedir(dueno, `/api/projects/${e.proyectoA}/connections`)).status, 200);
  eq_('dueño · equipo del A', (await pedir(dueno, `/api/projects/${e.proyectoA}/members`)).status, 200);
  eq_('dueño · conexiones del B', (await pedir(dueno, `/api/projects/${e.proyectoB}/connections`)).status, 200);

  const conexiones = await pedir(dueno, `/api/projects/${e.proyectoA}/connections`);
  eq_('las conexiones no devuelven ni un token', JSON.stringify(conexiones.body).includes('page_token'), false);

  // --- el conector solo conecta --------------------------------------------
  const suLista = await pedir(conector, '/api/projects');
  eq_('conector · /api/projects', suLista.status, 200);
  eq_('conector · ve UN proyecto', suLista.body?.projects?.length, 1);
  eq_('conector · y es el A', suLista.body?.projects?.[0]?.id, e.proyectoA);

  eq_('conector · SÍ ve conexiones del A', (await pedir(conector, `/api/projects/${e.proyectoA}/connections`)).status, 200);

  const suEquipo = await pedir(conector, `/api/projects/${e.proyectoA}/members`);
  eq_('conector · NO ve el equipo', suEquipo.status, 403);
  eq_('conector · y le dicen por qué', suEquipo.body?.problem, 'project_role');

  eq_(
    'conector · NO crea enlaces',
    (await pedir(conector, `/api/projects/${e.proyectoA}/links`, { method: 'POST', body: '{}' })).status,
    403,
  );
  eq_(
    'conector · NO invita',
    (
      await pedir(conector, `/api/projects/${e.proyectoA}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'colado@vforge.site', role: 'dueño' }),
      })
    ).status,
    403,
  );
  eq_(
    'conector · NO edita el proyecto',
    (
      await pedir(conector, `/api/projects/${e.proyectoA}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Me lo quedo yo' }),
      })
    ).status,
    403,
  );
  const sigueIgual = await getProject(e.orgId, e.proyectoA);
  eq_('y el nombre no se movió', sigueIgual?.name, 'Proyecto A');

  // --- el proyecto B no existe para él -------------------------------------
  const ajeno = await pedir(conector, `/api/projects/${e.proyectoB}/connections`);
  eq_('conector · proyecto ajeno de su propia org: 403', ajeno.status, 403);
  eq_('conector · proyecto ajeno: 403 también en el detalle', (await pedir(conector, `/api/projects/${e.proyectoB}`)).status, 403);

  // --- las páginas también, no solo las APIs -------------------------------
  const pagina = await pedir(conector, `/projects/${e.proyectoB}`);
  check('conector · la PÁGINA del B tampoco', pagina.status !== 200 || !String(pagina.body).includes('Proyecto B'), `status ${pagina.status}`);

  // --- el 403 no es un "niega siempre" --------------------------------------
  const filas = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, e.proyectoA), eq(projectMembers.clerkUserId, e.invitado.clerkId)));
  await setProjectMemberRole(e.orgId, e.proyectoA, filas[0].id, 'dueño');
  const ahoraSi = await pedir(conector, `/api/projects/${e.proyectoA}/members`);
  eq_('con rol de dueño, el MISMO endpoint da 200', ahoraSi.status, 200);
  await setProjectMemberRole(e.orgId, e.proyectoA, filas[0].id, 'conector');
  eq_(
    'y al devolverle el rol, vuelve el 403',
    (await pedir(conector, `/api/projects/${e.proyectoA}/members`)).status,
    403,
  );

  // --- un proyecto que no existe se ve igual que uno ajeno ------------------
  eq_(
    'proyecto inexistente: 404',
    (await pedir(dueno, '/api/projects/00000000-0000-0000-0000-000000000000/connections')).status,
    404,
  );

  // --- las APIs viejas de ventas también respetan el rol del proyecto -------
  // Aquí es donde el modelo de roles se rompía: la pantalla no le ofrecía el
  // botón al conector, pero la ruta sí le contestaba. Esconder el link nunca
  // fue protección.
  console.log('\n— el rol del proyecto vale también en las APIs de ventas —');

  const moverEtapa = () =>
    pedir(conector, `/api/sales/leads/${e.leadA}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'cerrado' }),
    });

  eq_('conector · NO mueve una etapa', (await moverEtapa()).status, 403);
  const trasIntento = await db.select().from(salesLeads).where(eq(salesLeads.id, e.leadA)).limit(1);
  eq_('y el lead sigue donde estaba', trasIntento[0]?.stage, 'nuevo');

  eq_(
    'conector · NO da de alta leads',
    (
      await pedir(conector, '/api/sales/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: e.proyectoA, phone: '+5215500000099', fullName: 'Colado' }),
      })
    ).status,
    403,
  );
  eq_(
    'conector · NO prueba el vendedor',
    (
      await pedir(conector, '/api/sales/seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: e.proyectoA, message: 'hola, precio?' }),
      })
    ).status,
    403,
  );

  // Y el 403 tampoco es un "niega siempre": con rol de editor, la misma
  // petición mueve la etapa de verdad.
  const filaConector = filas[0];
  await setProjectMemberRole(e.orgId, e.proyectoA, filaConector.id, 'editor');
  eq_('editor · SÍ mueve la etapa', (await moverEtapa()).status, 200);
  const movido = await db.select().from(salesLeads).where(eq(salesLeads.id, e.leadA)).limit(1);
  eq_('y el lead de verdad se movió', movido[0]?.stage, 'cerrado');
  eq_(
    'editor · pero sigue SIN ver el equipo',
    (await pedir(conector, `/api/projects/${e.proyectoA}/members`)).status,
    403,
  );
  await setProjectMemberRole(e.orgId, e.proyectoA, filaConector.id, 'conector');
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

async function limpiar(e: Escenario | null): Promise<void> {
  console.log('\n— limpieza —');
  if (e) {
    const proyectos = [e.proyectoA, e.proyectoB];
    const borrados: string[] = [];
    const paso = async (nombre: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        borrados.push(nombre);
      } catch (err) {
        console.error(`  ! no se pudo limpiar ${nombre}: ${(err as Error).message}`);
      }
    };
    await paso('messages', () => db.delete(messages).where(eq(messages.orgId, e.orgId)));
    await paso('sales_lead_events', () => db.delete(salesLeadEvents).where(eq(salesLeadEvents.orgId, e.orgId)));
    await paso('action_queue', () => db.delete(actionQueue).where(eq(actionQueue.orgId, e.orgId)));
    await paso('conversations', () => db.delete(conversations).where(eq(conversations.orgId, e.orgId)));
    await paso('sales_leads', () => db.delete(salesLeads).where(eq(salesLeads.orgId, e.orgId)));
    await paso('project_events', () => db.delete(projectEvents).where(inArray(projectEvents.projectId, proyectos)));
    await paso('connection_links', () => db.delete(connectionLinks).where(inArray(connectionLinks.projectId, proyectos)));
    await paso('project_members', () => db.delete(projectMembers).where(inArray(projectMembers.projectId, proyectos)));
    await paso('social_accounts', () => db.delete(socialAccounts).where(eq(socialAccounts.orgId, e.orgId)));
    await paso('knowledge', () => db.delete(knowledge).where(eq(knowledge.orgId, e.orgId)));
    await paso('campaigns', () => db.delete(campaigns).where(eq(campaigns.orgId, e.orgId)));
    await paso('org_memberships', () => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
    await paso('organizations', () => db.delete(organizations).where(eq(organizations.id, e.orgId)));
    console.log(`  borrado: ${borrados.join(', ')}`);
  }

  for (const id of CREADOS.orgs) {
    await clerk(`/organizations/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  for (const id of CREADOS.users) {
    await clerk(`/users/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await db.delete(users).where(eq(users.clerkId, id)).catch(() => undefined);
  }
  console.log(`  Clerk: ${CREADOS.orgs.length} orgs y ${CREADOS.users.length} usuarios borrados`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('PRUEBAS · GOOSSIP CORRIDA 3 — el proyecto es el centro');

  pruebaRoles();
  pruebaSinJerga();
  pruebaCanales();
  await pruebaMigracion();

  let escenario: Escenario | null = null;
  try {
    if (!CK) {
      console.log('\n(sin CLERK_SECRET_KEY: no se montan usuarios de verdad)');
    } else {
      escenario = await montarEscenario();
      await pruebaEnlaces(escenario.orgId, escenario.proyectoA, escenario.invitado.clerkId);
      await pruebaAislamientoDatos(escenario);
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
