/**
 * Pruebas de la corrida 5 — conexiones por Composio.
 *
 *   npx tsx test/composio.test.ts
 *
 * Lo que se prueba, y por qué cada una está aquí:
 *
 *  1. El catálogo contra el catálogo REAL de Composio. Si mañana Composio
 *     habilita la auth administrada de TikTok, o la quita de Canva, esta
 *     prueba lo caza aquí y no en la pantalla de un cliente.
 *  2. Un auth config por toolkit, y correr el bootstrap dos veces no crea
 *     ninguno nuevo. Lo contrario llenaría la cuenta de apps duplicadas.
 *  3. Connect Link de verdad: se pide, la URL es de Composio, el
 *     `callback_url` lleva proyecto y toolkit, y la cuenta nace
 *     `INITIALIZING` — no `ACTIVE`. Volver del navegador no conecta nada.
 *  4. Una conexión REAL, viva, ejecutando una acción REAL contra la cuenta del
 *     PROYECTO (Airtable con la llave de Luis), y escribiendo y leyendo de
 *     vuelta. Es la prueba de que esto no es un formulario bonito.
 *  5. Verde solo con verificación fresca (issue #33), y "Reconectar" cuando la
 *     cuenta se cae.
 *  6. Aislamiento: el proyecto B no ve lo del proyecto A, ni en la misma org ni
 *     en otra.
 *  7. Dedupe de leads por `leadgen_id` entre el webhook y el poll.
 *  8. Revocar borra la cuenta EN COMPOSIO, no solo en nuestra tabla.
 *
 * Todo lo que crea —en la base y en Composio— se borra al final, pase o falle.
 */
import '../src/env';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  campaigns,
  composioAuthConfigs,
  organizations,
  salesLeadEvents,
  salesLeads,
  socialAccounts,
  users,
} from '../src/db/schema';
import {
  composioKey,
  composioReady,
  createConnectLink,
  deleteConnectedAccount,
  executeTool,
  getConnectedAccount,
  getToolkit,
  listAuthConfigs,
  toolkitIsManaged,
} from '../src/composio/client';
import { ensureCatalogAuthConfigs, listStoredAuthConfigs } from '../src/composio/auth-configs';
import {
  CONNECTORS,
  connectorMode,
  connectorShareable,
  managedComposioSlugs,
  unmanagedComposioConnectors,
} from '../src/projects/catalog';
import {
  buildChannelCards,
  composioUserId,
  listProjectAccounts,
  markNeedsReconnect,
  saveConnection,
  stageConnection,
  verificacionFresca,
} from '../src/projects/connections';
import {
  callbackUrlFor,
  connectedAccountIdDe,
  handleDeCuenta,
  motivoEnEspanol,
  verifyAccount,
} from '../src/projects/composio-connections';
import { adapterFor } from '../src/channels';
import { normalizaLead } from '../src/channels/publicacion';
import { ingestLead } from '../src/sales/ingest';
import { desdeCuando } from '../src/sales/composio-leads';
import { createProject } from '../src/sales/projects';
import { upsertOrg } from '../src/orgs/repo';

// ---------------------------------------------------------------------------
// Arnés
// ---------------------------------------------------------------------------

let pasadas = 0;
const fallidas: string[] = [];

function check(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) {
    pasadas++;
    console.log(`  ok  ${nombre}`);
  } else {
    fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
    console.error(`  ✗   ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

function eq_(nombre: string, actual: unknown, esperado: unknown): void {
  check(nombre, Object.is(actual, esperado), `esperaba ${String(esperado)}, llegó ${String(actual)}`);
}

const SUFIJO = `c5-${Date.now()}`;
const basura = {
  orgs: [] as string[],
  usuarios: [] as string[],
  proyectos: [] as string[],
  cuentasComposio: [] as string[],
  authConfigsComposio: [] as string[],
  registrosAirtable: [] as Array<{ base: string; tabla: string; id: string }>,
};

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://backend.composio.dev/api/v3${path}`, {
    ...init,
    headers: {
      'x-api-key': composioKey() ?? '',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// ---------------------------------------------------------------------------
// 1 · El catálogo contra el catálogo real
// ---------------------------------------------------------------------------

async function pruebaCatalogo(): Promise<void> {
  console.log('\n— catálogo contra el catálogo real de Composio —');
  const composio = CONNECTORS.filter((c) => c.via === 'composio');
  eq_('21 toolkits de Composio en el catálogo', composio.length, 21);

  let coinciden = 0;
  const desacuerdos: string[] = [];
  for (const c of composio) {
    const tk = await getToolkit(c.slug);
    if (!tk) {
      desacuerdos.push(`${c.slug}: no existe`);
      continue;
    }
    if (toolkitIsManaged(tk) === c.managed) coinciden += 1;
    else desacuerdos.push(`${c.slug}: catálogo dice ${toolkitIsManaged(tk)}`);
  }
  eq_('cada slug existe y su managed coincide', coinciden, composio.length);
  check('sin desacuerdos con Composio', desacuerdos.length === 0, desacuerdos.join(' · '));

  const sinManaged = unmanagedComposioConnectors().map((c) => c.slug).sort();
  check(
    'los que no tienen auth administrada están declarados',
    JSON.stringify(sinManaged) === JSON.stringify(['metaads', 'semrush', 'tiktok', 'twitter']),
    sinManaged.join(','),
  );

  // Klaviyo salió del catálogo por esto mismo: se comprueba, no se recuerda.
  const klaviyo = await getToolkit('klaviyo');
  check(
    'Klaviyo sigue sin auth administrada (por eso va Mailchimp)',
    Boolean(klaviyo) && !toolkitIsManaged(klaviyo!),
    `managed=${klaviyo ? toolkitIsManaged(klaviyo) : 'no existe'}`,
  );

  eq_('todo lo de Composio se conecta con permiso, no escribiendo datos',
    composio.every((c) => connectorMode(c.slug) === 'oauth'), true);
  eq_('y por lo mismo se puede pedir por enlace de un solo uso',
    composio.every((c) => connectorShareable(c.slug)), true);
}

// ---------------------------------------------------------------------------
// 2 · Auth configs: uno por toolkit, e idempotente
// ---------------------------------------------------------------------------

async function pruebaAuthConfigs(): Promise<void> {
  console.log('\n— auth configs —');
  const antes = await ensureCatalogAuthConfigs();
  const listos = antes.filter((r) => r.authConfigId).length;
  eq_('hay auth config para los 17 con auth administrada', listos, managedComposioSlugs().length);

  const segunda = await ensureCatalogAuthConfigs();
  eq_('la segunda corrida no crea ninguno', segunda.filter((r) => r.accion === 'creado').length, 0);
  eq_('la segunda corrida no adopta ninguno', segunda.filter((r) => r.accion === 'adoptado').length, 0);

  const guardados = await listStoredAuthConfigs();
  eq_('todos quedaron guardados en la tabla', guardados.size >= listos, true);
  check(
    'todos los ids tienen forma de auth config',
    [...guardados.values()].every((r) => r.authConfigId.startsWith('ac_')),
    [...guardados.values()].map((r) => r.authConfigId).join(','),
  );

  // Ninguno duplicado en Composio para nuestros toolkits.
  const remotos = await listAuthConfigs();
  const mios = new Set([...guardados.values()].map((r) => r.authConfigId));
  const duplicados = managedComposioSlugs().filter((slug) => {
    const delToolkit = remotos.filter((a) => a.toolkit?.slug === slug && mios.has(a.id));
    return delToolkit.length > 1;
  });
  check('ningún toolkit con dos auth configs nuestros', duplicados.length === 0, duplicados.join(','));

  const logos = [...guardados.values()].filter((r) => r.logo);
  check('los logos salieron del catálogo de Composio', logos.length >= 15, `${logos.length} con logo`);
}

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------

interface Escenario {
  orgA: string;
  orgB: string;
  proyectoA1: any;
  proyectoA2: any;
  proyectoB1: any;
}

async function montar(): Promise<Escenario> {
  const orgA = `org_${SUFIJO}_a`;
  const orgB = `org_${SUFIJO}_b`;
  await upsertOrg({ id: orgA, name: `Prueba A ${SUFIJO}`, slug: `prueba-a-${SUFIJO}` });
  await upsertOrg({ id: orgB, name: `Prueba B ${SUFIJO}`, slug: `prueba-b-${SUFIJO}` });
  basura.orgs.push(orgA, orgB);

  const [usuario] = await db
    .insert(users)
    .values({ clerkId: `user_${SUFIJO}`, email: `c5-${SUFIJO}@prueba.goossip`, name: 'Prueba C5' })
    .returning();
  basura.usuarios.push(usuario.id);

  const proyectoA1 = await createProject(orgA, usuario.id, { name: `A1 ${SUFIJO}`, kind: 'servicios' });
  const proyectoA2 = await createProject(orgA, usuario.id, { name: `A2 ${SUFIJO}`, kind: 'servicios' });
  const proyectoB1 = await createProject(orgB, usuario.id, { name: `B1 ${SUFIJO}`, kind: 'servicios' });
  basura.proyectos.push(proyectoA1.id, proyectoA2.id, proyectoB1.id);
  return { orgA, orgB, proyectoA1, proyectoA2, proyectoB1 };
}

// ---------------------------------------------------------------------------
// 3 · Connect Link de verdad
// ---------------------------------------------------------------------------

async function pruebaConnectLink(e: Escenario): Promise<void> {
  console.log('\n— connect link —');
  const guardados = await listStoredAuthConfigs();
  const slack = guardados.get('slack');
  check('slack tiene auth config', Boolean(slack), 'falta');
  if (!slack) return;

  const callback = callbackUrlFor('https://vliving.life', e.proyectoA1.id, 'slack');
  check('el callback lleva proyecto y toolkit',
    callback.includes(`project=${e.proyectoA1.id}`) && callback.includes('toolkit=slack'),
    callback);

  const link = await createConnectLink({
    authConfigId: slack.authConfigId,
    userId: composioUserId(e.proyectoA1.id),
    callbackUrl: callback,
  });
  basura.cuentasComposio.push(link.connected_account_id);

  check('el enlace es de Composio', link.redirect_url.startsWith('https://connect.composio.dev/'),
    link.redirect_url);
  check('trae id de cuenta', link.connected_account_id.startsWith('ca_'), link.connected_account_id);

  const cuenta = await getConnectedAccount(link.connected_account_id);
  eq_('la cuenta NACE sin estar activa', cuenta?.status, 'INITIALIZING');
  eq_('y cuelga del proyecto, no del usuario', cuenta?.user_id, composioUserId(e.proyectoA1.id));

  // La fila queda en `connecting`: ni conectada ni inventada.
  await stageConnection({
    orgId: e.orgA,
    projectId: e.proyectoA1.id,
    channel: 'slack',
    connectedBy: 'user_prueba',
    status: 'connecting',
    metadata: { connected_account_id: link.connected_account_id, via: 'composio' },
  });
  const filas = await listProjectAccounts(e.orgA, e.proyectoA1.id);
  const fila = filas.find((f) => f.platform === 'slack');
  eq_('la fila queda a medias, no conectada', fila?.status, 'connecting');
  eq_('y guarda el id de la cuenta de Composio', connectedAccountIdDe(fila ?? null),
    link.connected_account_id);

  const { cards } = buildChannelCards(e.proyectoA1, filas);
  const tarjeta = cards.find((c) => c.id === 'slack')!;
  eq_('la tarjeta NO dice Conectado', tarjeta.state, 'sin_conectar');
  check('y avisa que se quedó a medias', Boolean(tarjeta.pending), 'no avisó');

  // Una cuenta a medias no vale para ejecutar acciones.
  const adapter = adapterFor('slack')!;
  let bloqueada = false;
  await adapter.notify?.(e.proyectoA1, { canal: '#nada', texto: 'no debería salir' }).catch((err) => {
    bloqueada = /Conecta Slack/i.test(String(err?.message ?? err));
  });
  check('sin cuenta viva, la acción no se intenta', bloqueada, 'se intentó igual');
}

// ---------------------------------------------------------------------------
// 4 · Una conexión REAL, con acción real
// ---------------------------------------------------------------------------

async function pruebaConexionReal(e: Escenario): Promise<{ ok: boolean; detalle: string }> {
  console.log('\n— conexión real y acción real (Airtable) —');
  const token = (process.env.AIRTABLE_TOKEN ?? '').trim();
  if (!token) {
    check('AIRTABLE_TOKEN disponible para la prueba real', false, 'no está en el entorno');
    return { ok: false, detalle: 'sin AIRTABLE_TOKEN' };
  }

  // Auth config de API key SOLO para la prueba: autorizar un OAuth de Google o
  // Slack necesita a un humano con esas cuentas, y una prueba que depende de un
  // humano no es una prueba. El producto usa el auth config administrado.
  const creado = await api('/auth_configs', {
    method: 'POST',
    body: JSON.stringify({
      toolkit: { slug: 'airtable' },
      auth_config: {
        type: 'use_custom_auth',
        authScheme: 'API_KEY',
        name: `goossip-prueba-${SUFIJO}`,
        credentials: {},
      },
    }),
  });
  const authConfigId = creado?.auth_config?.id;
  if (!authConfigId) {
    check('auth config de prueba creado', false, JSON.stringify(creado).slice(0, 200));
    return { ok: false, detalle: 'no se pudo crear el auth config de prueba' };
  }
  basura.authConfigsComposio.push(authConfigId);

  const conectada = await api('/connected_accounts', {
    method: 'POST',
    body: JSON.stringify({
      auth_config: { id: authConfigId },
      connection: {
        user_id: composioUserId(e.proyectoA1.id),
        state: { authScheme: 'API_KEY', val: { status: 'ACTIVE', generic_api_key: token } },
      },
    }),
  });
  const cuentaId = conectada?.id;
  if (!cuentaId) {
    check('cuenta real conectada', false, JSON.stringify(conectada).slice(0, 200));
    return { ok: false, detalle: 'no se pudo conectar la cuenta real' };
  }
  basura.cuentasComposio.push(cuentaId);
  eq_('la cuenta real queda ACTIVE', conectada.status, 'ACTIVE');

  await saveConnection({
    orgId: e.orgA,
    projectId: e.proyectoA1.id,
    channel: 'airtable',
    connectedBy: 'user_prueba',
    label: 'Airtable de prueba',
    verifiedAt: new Date(),
    metadata: { connected_account_id: cuentaId, via: 'composio' },
  });

  // --- verify() contra Composio, no contra nuestra base ---
  const filas = await listProjectAccounts(e.orgA, e.proyectoA1.id);
  const fila = filas.find((f) => f.platform === 'airtable')!;
  const v = await verifyAccount(e.proyectoA1, fila);
  eq_('verify() dice ACTIVE', v.status, 'ACTIVE');
  eq_('y la deja conectada', v.ok, true);

  // --- acción REAL: leer las bases del cliente ---
  const adapter = adapterFor('airtable')!;
  const bases: any = await executeTool('AIRTABLE_LIST_BASES', {
    userId: composioUserId(e.proyectoA1.id),
    connectedAccountId: cuentaId,
  });
  const lista: any[] = bases?.data?.response_data?.bases ?? bases?.data?.bases ?? [];
  check('leyó bases reales de Airtable', lista.length > 0, `bases=${lista.length}`);

  // --- acción REAL de escritura, y lectura de vuelta ---
  const baseId = 'appJhfkOPHt3F5cMC';
  const tabla = 'V-Momentum';
  const marca = `Goossip prueba C5 ${SUFIJO}`;
  let escrito = false;
  let leidoDeVuelta = false;
  try {
    const nuevo: any = await adapter.writeContact?.(e.proyectoA1, {
      baseId,
      table: tabla,
      fields: { Name: marca, Notes: 'Fila de prueba de la corrida 5. Se borra sola.' },
    });
    const id = nuevo?.response_data?.id ?? nuevo?.id ?? nuevo?.data?.id ?? null;
    escrito = Boolean(id);
    if (id) basura.registrosAirtable.push({ base: baseId, tabla, id: String(id) });

    const filasLeidas: any = await adapter.readRows?.(e.proyectoA1, {
      baseId,
      table: tabla,
      pageSize: 100,
    });
    const registros: any[] =
      filasLeidas?.response_data?.records ?? filasLeidas?.records ?? filasLeidas?.data?.records ?? [];
    leidoDeVuelta = registros.some((r: any) => r?.fields?.Name === marca);
  } catch (err) {
    check('la escritura real no reventó', false, String((err as Error)?.message).slice(0, 160));
  }
  check('escribió una fila de verdad en Airtable', escrito, 'no devolvió id');
  check('y la leyó de vuelta por el mismo camino', leidoDeVuelta, 'no apareció al releer');

  // La importación de conocimiento sale de aquí: documentos con contenido de
  // verdad, listos para embeddings. Si esto viene vacío, el botón "Importar"
  // sería un botón que no trae nada.
  const docs = (await adapter.readDocs?.(e.proyectoA1, { baseId, table: tabla, pageSize: 5 })) ?? [];
  check('la importación de conocimiento saca documentos con texto',
    docs.length > 0 && docs.every((d) => d.contenido.length > 0),
    `${docs.length} documentos`);
  check('y cada uno dice de dónde salió',
    docs.every((d) => d.fuente.startsWith('airtable:')),
    docs[0]?.fuente ?? 'sin fuente');

  return {
    ok: escrito && leidoDeVuelta,
    detalle: `Airtable · ${lista.length} bases leídas · fila escrita y releída en "${tabla}"`,
  };
}

// ---------------------------------------------------------------------------
// 5 · Verde solo con verificación fresca
// ---------------------------------------------------------------------------

async function pruebaFrescura(e: Escenario): Promise<void> {
  console.log('\n— nada verde sin verificación de menos de 24 h —');
  const ahora = new Date();
  eq_('recién verificada: fresca', verificacionFresca(new Date(ahora.getTime() - 60_000), ahora), true);
  eq_('de hace 23 h: fresca', verificacionFresca(new Date(ahora.getTime() - 23 * 3600_000), ahora), true);
  eq_('de hace 25 h: rancia', verificacionFresca(new Date(ahora.getTime() - 25 * 3600_000), ahora), false);
  eq_('sin verificar: rancia', verificacionFresca(null, ahora), false);

  const base = [
    {
      platform: 'notion',
      status: 'connected',
      metadata: { via: 'composio', connected_account_id: 'ca_falsa' },
      connectedBy: 'user_prueba',
      connectedAt: ahora,
      label: 'Notion de prueba',
    } as any,
  ];

  const fresca = buildChannelCards(e.proyectoA1, [{ ...base[0], verifiedAt: ahora }], { ahora });
  eq_('con verificación fresca: Conectado', fresca.cards.find((c) => c.id === 'notion')!.state, 'conectado');

  const rancia = buildChannelCards(
    e.proyectoA1,
    [{ ...base[0], verifiedAt: new Date(ahora.getTime() - 26 * 3600_000) }],
    { ahora },
  );
  const tarjeta = rancia.cards.find((c) => c.id === 'notion')!;
  eq_('con verificación vieja: Reconectar', tarjeta.state, 'reconectar');
  check('y dice por qué', Boolean(tarjeta.pending), 'no dijo');

  // Una cuenta que ya no existe allá cae a "Reconectar" con motivo en español.
  await saveConnection({
    orgId: e.orgA,
    projectId: e.proyectoA2.id,
    channel: 'notion',
    connectedBy: 'user_prueba',
    verifiedAt: ahora,
    metadata: { connected_account_id: 'ca_esta_no_existe', via: 'composio' },
  });
  const filas = await listProjectAccounts(e.orgA, e.proyectoA2.id);
  const v = await verifyAccount(e.proyectoA2, filas.find((f) => f.platform === 'notion')!);
  eq_('cuenta inexistente: verify() la tumba', v.ok, false);
  const despues = await listProjectAccounts(e.orgA, e.proyectoA2.id);
  eq_('la fila queda para reconectar', despues.find((f) => f.platform === 'notion')?.status, 'needs_reconnect');
  const cards = buildChannelCards(e.proyectoA2, despues).cards;
  eq_('y la tarjeta lo dice', cards.find((c) => c.id === 'notion')!.state, 'reconectar');

  // El motivo que ve el usuario nunca es el texto crudo del proveedor.
  check('los motivos están en español y sin jerga',
    ['EXPIRED', 'FAILED', 'INACTIVE', 'INITIALIZING', 'CUALQUIERA']
      .map(motivoEnEspanol)
      .every((m) => /^[A-ZÁÉÍÓÚÑ¿]/.test(m) && !/token|oauth|grant|api/i.test(m)),
    ['EXPIRED', 'FAILED'].map(motivoEnEspanol).join(' · '));
}

// ---------------------------------------------------------------------------
// 6 · Aislamiento entre proyectos
// ---------------------------------------------------------------------------

async function pruebaAislamiento(e: Escenario): Promise<void> {
  console.log('\n— aislamiento entre proyectos —');
  const deA1 = await listProjectAccounts(e.orgA, e.proyectoA1.id);
  const deA2 = await listProjectAccounts(e.orgA, e.proyectoA2.id);
  const deB1 = await listProjectAccounts(e.orgB, e.proyectoB1.id);

  check('el proyecto A1 tiene sus conexiones', deA1.length > 0, `${deA1.length}`);
  eq_('A2 (misma org) no ve las de A1',
    deA2.some((f) => deA1.some((g) => g.id === f.id)), false);
  eq_('B1 (otra org) no ve ninguna de A1', deB1.length, 0);

  // El candado de org también cuenta: pedir A1 con el org de B no devuelve nada.
  const cruzado = await listProjectAccounts(e.orgB, e.proyectoA1.id);
  eq_('pedir el proyecto de otra org devuelve vacío', cruzado.length, 0);

  // Y ante Composio son inquilinos distintos.
  check('cada proyecto es otro user_id ante Composio',
    composioUserId(e.proyectoA1.id) !== composioUserId(e.proyectoA2.id),
    composioUserId(e.proyectoA1.id));

  const cuentasA1 = await api(`/connected_accounts?user_ids=${composioUserId(e.proyectoA1.id)}`);
  const cuentasA2 = await api(`/connected_accounts?user_ids=${composioUserId(e.proyectoA2.id)}`);
  check('Composio devuelve las de A1', (cuentasA1?.items ?? []).length > 0, `${(cuentasA1?.items ?? []).length}`);
  eq_('y ninguna de A1 aparece en A2',
    (cuentasA2?.items ?? []).some((c: any) => (cuentasA1?.items ?? []).some((d: any) => d.id === c.id)),
    false);

  // Las tarjetas de A2 no enseñan nada de A1.
  const cards = buildChannelCards(e.proyectoA2, deA2).cards;
  eq_('A2 no tiene Airtable conectado', cards.find((c) => c.id === 'airtable')!.state, 'sin_conectar');
}

// ---------------------------------------------------------------------------
// 7 · Dedupe de leads
// ---------------------------------------------------------------------------

async function pruebaLeads(e: Escenario): Promise<void> {
  console.log('\n— leads de Meta por Composio —');

  // El aplanado de un lead real de Graph, con los nombres de campo que pone
  // quien arma el formulario (no los que a uno le gustaría).
  const crudo = {
    id: `lead_${SUFIJO}`,
    created_time: '2026-09-16T10:00:00+0000',
    form_id: '2146578942620117',
    field_data: [
      { name: 'full_name', values: ['Ana Pérez'] },
      { name: 'phone_number', values: ['+52 55 1234 5678'] },
      { name: 'correo_electronico', values: ['ana@ejemplo.mx'] },
    ],
  };
  const lead = normalizaLead(crudo, '2146578942620117');
  eq_('saca el nombre', lead.fullName, 'Ana Pérez');
  eq_('saca el teléfono aunque el campo se llame distinto', lead.phone, '+52 55 1234 5678');
  eq_('saca el correo aunque venga en español', lead.email, 'ana@ejemplo.mx');
  eq_('y conserva el leadgen_id', lead.leadgenId, `lead_${SUFIJO}`);

  // Dedupe: el webhook y el poll traen el MISMO lead.
  const primero = await ingestLead({
    project: e.proyectoA1,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    source: 'meta_leadgen',
    sourceRef: lead.leadgenId,
    createdAt: lead.createdAt,
    skipLookup: true,
    skipQueue: true,
    raw: { via: 'webhook' },
  });
  eq_('el webhook lo da de alta', primero.created, true);

  const segundo = await ingestLead({
    project: e.proyectoA1,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    source: 'meta_leadgen',
    sourceRef: lead.leadgenId,
    createdAt: lead.createdAt,
    skipLookup: true,
    skipQueue: true,
    raw: { via: 'composio' },
  });
  eq_('el poll NO lo duplica', segundo.created, false);
  eq_('y es el mismo lead', segundo.lead.id, primero.lead.id);

  const enBase = await db
    .select()
    .from(salesLeads)
    .where(and(eq(salesLeads.campaignId, e.proyectoA1.id), eq(salesLeads.sourceRef, lead.leadgenId)));
  eq_('hay UNA fila para ese leadgen_id', enBase.length, 1);

  // La ventana del poll arranca del último lead, no del principio de los tiempos.
  const desde = await desdeCuando(e.proyectoA1);
  check('el poll pide desde el último lead',
    Math.abs(desde.getTime() - (lead.createdAt.getTime() - 60_000)) < 5_000,
    desde.toISOString());

  const vacio = await desdeCuando(e.proyectoA2);
  check('un proyecto sin leads mira 7 días atrás',
    Math.abs(Date.now() - vacio.getTime() - 7 * 24 * 3600_000) < 60_000,
    vacio.toISOString());
}

// ---------------------------------------------------------------------------
// 8 · Revocar borra en Composio
// ---------------------------------------------------------------------------

async function pruebaRevocar(e: Escenario): Promise<void> {
  console.log('\n— revocar —');
  const filas = await listProjectAccounts(e.orgA, e.proyectoA1.id);
  const airtable = filas.find((f) => f.platform === 'airtable');
  if (!airtable) {
    check('había una cuenta real que revocar', false, 'no se creó');
    return;
  }
  const cuentaId = connectedAccountIdDe(airtable)!;
  const { revokeComposioConnection } = await import('../src/projects/composio-connections');
  const r = await revokeComposioConnection(e.proyectoA1, 'airtable');
  eq_('la borra en Composio', r.borradaEnComposio, true);

  const remota = await getConnectedAccount(cuentaId);
  check('y en Composio ya no está viva', remota === null || remota.status !== 'ACTIVE',
    `estado=${remota?.status}`);

  const despues = await listProjectAccounts(e.orgA, e.proyectoA1.id);
  const fila = despues.find((f) => f.platform === 'airtable')!;
  eq_('la fila queda desconectada', fila.status, 'disconnected');
  eq_('y pierde la verificación', fila.verifiedAt, null);
  check('pero NO se borra: la bitácora se queda', Boolean(fila.connectedBy), 'se perdió quién');
}

// ---------------------------------------------------------------------------
// Un caso que DEBE fallar
// ---------------------------------------------------------------------------

async function pruebaQueDebeFallar(e: Escenario): Promise<void> {
  console.log('\n— el detector de verdad detecta —');
  // Si `verificacionFresca` devolviera siempre true, la regla del issue #33 no
  // valdría nada. Se le da a mano una fecha imposible.
  const futuro = new Date(Date.now() + 10 * 24 * 3600_000);
  const vieja = new Date('2020-01-01T00:00:00Z');
  eq_('una verificación de 2020 nunca es fresca', verificacionFresca(vieja), false);
  const cards = buildChannelCards(
    e.proyectoA1,
    [
      {
        platform: 'gmail',
        status: 'connected',
        verifiedAt: vieja,
        metadata: { via: 'composio' },
        connectedAt: futuro,
      } as any,
    ],
  ).cards;
  eq_('y esa tarjeta JAMÁS sale verde', cards.find((c) => c.id === 'gmail')!.state, 'reconectar');

  // Un handle inventado no se acepta: si el proveedor no lo da, es null.
  eq_('sin datos, no se inventa el nombre de la cuenta',
    handleDeCuenta({ id: 'ca_x', user_id: 'u', status: 'ACTIVE', data: {} }), null);
  eq_('con datos, lo usa', handleDeCuenta({
    id: 'ca_x', user_id: 'u', status: 'ACTIVE', data: { email: 'quien@ejemplo.mx' },
  }), 'quien@ejemplo.mx');
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

async function limpiar(): Promise<void> {
  console.log('\n— limpieza —');
  for (const r of basura.registrosAirtable) {
    await fetch(`https://api.airtable.com/v0/${r.base}/${encodeURIComponent(r.tabla)}/${r.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` },
    }).catch(() => undefined);
  }
  for (const id of basura.cuentasComposio) {
    await deleteConnectedAccount(id).catch(() => undefined);
  }
  for (const id of basura.authConfigsComposio) {
    await api(`/auth_configs/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  if (basura.proyectos.length > 0) {
    // En dos pasos y no con una subconsulta: el driver HTTP de Neon no acepta
    // `IN (SELECT …)` armado desde el query builder (medido: 42601).
    const leads = await db
      .select({ id: salesLeads.id })
      .from(salesLeads)
      .where(inArray(salesLeads.campaignId, basura.proyectos));
    if (leads.length > 0) {
      await db.delete(salesLeadEvents).where(
        inArray(salesLeadEvents.leadId, leads.map((l) => l.id)),
      );
    }
    await db.delete(salesLeads).where(inArray(salesLeads.campaignId, basura.proyectos));
    await db.delete(socialAccounts).where(inArray(socialAccounts.campaignId, basura.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, basura.proyectos));
  }
  if (basura.usuarios.length > 0) await db.delete(users).where(inArray(users.id, basura.usuarios));
  if (basura.orgs.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, basura.orgs));
  }
  const quedan = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(inArray(campaigns.id, basura.proyectos.length ? basura.proyectos : ['-']));
  eq_('no quedó basura de la prueba', quedan.length, 0);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`GOOSSIP CORRIDA 5 — pruebas de Composio (${SUFIJO})`);
  if (!composioReady()) {
    console.error('\nSIN COMPOSIO_API_KEY: estas pruebas no pueden correr.');
    process.exit(2);
  }

  let accionReal = 'no se ejecutó';
  try {
    await pruebaCatalogo();
    await pruebaAuthConfigs();
    const e = await montar();
    try {
      await pruebaConnectLink(e);
      const real = await pruebaConexionReal(e);
      accionReal = real.detalle;
      await pruebaFrescura(e);
      await pruebaAislamiento(e);
      await pruebaLeads(e);
      await pruebaRevocar(e);
      await pruebaQueDebeFallar(e);
    } finally {
      await limpiar();
    }
  } catch (e) {
    fallidas.push(`explotó: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  }

  console.log(`\nAcción real ejecutada por Composio: ${accionReal}`);
  console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
  for (const f of fallidas) console.log(`  ✗ ${f}`);
  process.exit(fallidas.length > 0 ? 1 : 0);
}

void main();
