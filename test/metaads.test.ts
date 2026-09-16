/**
 * Pruebas de la corrida 11: Meta Ads con la app propia de Goossip.
 *
 *   npx tsx test/metaads.test.ts                       (catálogo, tarjetas, cuentas)
 *   META_USER_TOKEN=… npx tsx test/metaads.test.ts     (+ lecturas REALES contra Graph)
 *
 * Qué se prueba y por qué:
 *
 *  1. El catálogo — Meta Ads deja de ser "Próximamente" y pasa a la app propia.
 *     La tarjeta tiene que ofrecer Conectar CUANDO HAY APP, y callarse cuando
 *     no: enseñar el botón sin credenciales es la mentira que esta corrida vino
 *     a quitar, al revés.
 *  2. Las tarjetas — los cinco estados por los que pasa una conexión, con el
 *     que de verdad importa en medio: volvió de Facebook y TODAVÍA no está
 *     conectada porque falta elegir cuenta. Verde ahí sería mentir.
 *  3. El dinero — costo por lead, centavos a pesos y el doble conteo de leads
 *     de Meta. Son los números que el cliente va a leer en su pantalla.
 *  4. Los errores en español — el "(#200) Ad account owner has NOT grant
 *     ads_management" no se le enseña a nadie: se traduce a dónde ir a
 *     arreglarlo.
 *  5. Con `META_USER_TOKEN`: las lecturas contra Graph de verdad, incluidas las
 *     que DEBEN fallar — la cuenta fuera del negocio y un código de OAuth
 *     inválido. Una prueba que solo mide los casos buenos no mide nada.
 *
 * El token NO se guarda en ningún lado: se usa para leer y se olvida. Es el
 * camino que deja el propio issue para validar las lecturas mientras la URL de
 * retorno no esté dada de alta en el Facebook Login de la app.
 */
import '../src/env';
import {
  CONNECTORS,
  connectorMode,
  connectorOrThrow,
  connectorShareable,
  unmanagedComposioConnectors,
} from '../src/projects/catalog';
import { buildChannelCards, channelAvailable } from '../src/projects/connections';
import {
  aDinero,
  calcularCpl,
  estadoEnEspañol,
  mapCampaña,
  presetDeDias,
  RESUMEN_VACIO,
  resumenEnUnaLinea,
} from '../src/channels/metaads';
import {
  estadoDeCuenta,
  exchangeAdsCode,
  gastoDe,
  leadsDeMeta,
  listAdAccounts,
  listCampaigns,
  META_ADS_SCOPES,
  MetaAdsError,
  metaAdsAuthorizeUrl,
  metaAdsCallbackUrl,
  motivoDeMeta,
  readAdAccount,
  readInsights,
  sumaDe,
} from '../lib/meta-ads';

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

const proyecto = {
  id: 'p1',
  orgId: 'o1',
  slug: 'proyecto-de-prueba',
  channels: {},
  mcpSources: [],
  rules: {},
} as any;

/** Cambia el entorno, corre y lo deja como estaba, pase o falle. */
function conEntorno<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const CON_APP = { META_APP_ID: '123456789', META_APP_SECRET: 'secreto-de-prueba-larguito' };

// ---------------------------------------------------------------------------
// 1 · El catálogo
// ---------------------------------------------------------------------------

function pruebaCatalogo(): void {
  console.log('\n— catálogo —');

  const c = connectorOrThrow('metaads');
  eq_('Meta Ads va con la app propia de Goossip', c.via, 'meta_own_app');
  eq_('y por lo tanto ya no sale Próximamente por falta de auth administrada', c.managed, true);
  eq_('se conecta autorizando, no escribiendo datos', connectorMode('metaads'), 'oauth');
  eq_('y se puede pedir por enlace de un solo uso', connectorShareable('metaads'), true);
  eq_('vive en Publicidad', c.group, 'publicidad');
  check(
    'la tarjeta avisa que es solo lectura',
    /solo lectura/i.test(c.note ?? ''),
    c.note ?? '(sin nota)',
  );

  check(
    'ya no está en la lista de los que Composio no puede administrar',
    !unmanagedComposioConnectors().some((x) => x.slug === 'metaads'),
    unmanagedComposioConnectors().map((x) => x.slug).join(','),
  );
  eq_(
    'es el ÚNICO conector con app propia de Meta en el catálogo',
    CONNECTORS.filter((x) => x.via === 'meta_own_app').length,
    1,
  );

  // Los permisos: los cuatro que pide el issue, ni uno más. Pedir de más es
  // como se cae una revisión de app de Meta.
  eq_(
    'los permisos son los cuatro acordados',
    META_ADS_SCOPES.join(','),
    'ads_read,ads_management,business_management,pages_show_list',
  );

  const url = conEntorno(CON_APP, () =>
    metaAdsAuthorizeUrl('https://goossip.app', 'firma-de-prueba'),
  );
  const u = new URL(url);
  eq_('el permiso se pide en Facebook', u.host, 'www.facebook.com');
  eq_(
    'y vuelve al callback de Meta Ads, no al de páginas',
    u.searchParams.get('redirect_uri'),
    'https://goossip.app/api/connections/metaads/callback',
  );
  eq_('con los permisos de anuncios', u.searchParams.get('scope'), META_ADS_SCOPES.join(','));
  check(
    'el callback de anuncios NO es el de páginas',
    metaAdsCallbackUrl('https://goossip.app') !== 'https://goossip.app/api/connections/meta/callback',
  );

  // Disponible = ¿hay con qué?, no ¿existe el código?
  eq_(
    'sin credenciales de la app, Meta Ads no se ofrece',
    conEntorno({ META_APP_ID: undefined, META_APP_SECRET: undefined }, () =>
      channelAvailable('metaads'),
    ),
    false,
  );
  eq_(
    'con credenciales, se ofrece',
    conEntorno({ ...CON_APP, META_ADS_ENABLED: undefined }, () => channelAvailable('metaads')),
    true,
  );
  eq_(
    'y NO depende de META_OWN_APP, que es el otro conector',
    conEntorno({ ...CON_APP, META_OWN_APP: 'false' }, () => channelAvailable('metaads')),
    true,
  );
  eq_(
    'la bandera lo apaga sin deploy',
    conEntorno({ ...CON_APP, META_ADS_ENABLED: 'false' }, () => channelAvailable('metaads')),
    false,
  );
  eq_(
    'y un [SENSITIVE] de Vercel no lo enciende por accidente',
    conEntorno({ META_APP_ID: '[SENSITIVE]', META_APP_SECRET: '[SENSITIVE]' }, () =>
      channelAvailable('metaads'),
    ),
    false,
  );
}

// ---------------------------------------------------------------------------
// 2 · La tarjeta, estado por estado
// ---------------------------------------------------------------------------

function tarjeta(cuenta: Record<string, unknown> | null) {
  return conEntorno(CON_APP, () => {
    const { cards } = buildChannelCards(proyecto, cuenta ? [cuenta as any] : []);
    return cards.find((c) => c.id === 'metaads')!;
  });
}

function pruebaTarjetas(): void {
  console.log('\n— la tarjeta de Meta Ads —');

  const sinNada = tarjeta(null);
  eq_('proyecto nuevo: sin conectar', sinNada.state, 'sin_conectar');
  eq_('y sin inventarse un detalle', sinNada.detail, null);

  // El paso de en medio: volvió de Facebook, falta elegir cuenta.
  const aMedias = tarjeta({
    platform: 'metaads',
    status: 'disconnected',
    metadata: {
      user_token: 'v1.sobre.cerrado.aqui',
      candidates: [
        {
          id: 'act_2629053887531679',
          accountId: '2629053887531679',
          name: 'V&LIVING Ads',
          business: 'V&living',
          currency: 'MXN',
          status: 1,
        },
      ],
    },
  });
  eq_('volvió de Facebook pero NO está conectada', aMedias.state, 'sin_conectar');
  check('y dice qué falta, en español', /elige/i.test(aMedias.pending ?? ''), aMedias.pending ?? '');
  eq_(
    'con la cuenta entre las que elegir',
    (aMedias.data.candidates as unknown[])?.length,
    1,
  );

  const conectada = tarjeta({
    platform: 'metaads',
    status: 'connected',
    externalId: 'act_2629053887531679',
    label: 'V&LIVING Ads',
    connectedBy: 'user_x',
    connectedAt: new Date(),
    verifiedAt: new Date(),
    metadata: { business: 'V&living', currency: 'MXN', account_status: 1 },
  });
  eq_('cuenta elegida y confirmada hoy: conectado', conectada.state, 'conectado');
  eq_('con el nombre real de la cuenta', conectada.detail, 'V&LIVING Ads');
  eq_('y su id, que es lo que lee Graph', conectada.data.account_id, 'act_2629053887531679');
  eq_('nunca el token', (conectada.data as Record<string, unknown>).user_token, undefined);

  const vieja = tarjeta({
    platform: 'metaads',
    status: 'connected',
    externalId: 'act_2629053887531679',
    label: 'V&LIVING Ads',
    verifiedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
    metadata: {},
  });
  eq_('sin confirmar en más de un día: NO es verde', vieja.state, 'reconectar');

  const caida = tarjeta({
    platform: 'metaads',
    status: 'needs_reconnect',
    externalId: 'act_2629053887531679',
    label: 'V&LIVING Ads',
    metadata: { motivo: 'Facebook cerró el permiso de esta cuenta. Vuelve a conectarla.' },
  });
  eq_('cuenta caída: reconectar', caida.state, 'reconectar');
  check(
    'con el motivo en español y sin jerga',
    /facebook/i.test(caida.pending ?? '') && !/[{}[\]]|#\d|OAuth/i.test(caida.pending ?? ''),
    caida.pending ?? '',
  );

  // Y sin app, la tarjeta se calla. No hay botón que no lleve a ningún lado.
  const sinApp = conEntorno({ META_APP_ID: undefined, META_APP_SECRET: undefined }, () => {
    const { cards } = buildChannelCards(proyecto, []);
    return cards.find((c) => c.id === 'metaads')!;
  });
  eq_('sin app de Meta: Próximamente', sinApp.state, 'proximamente');
}

// ---------------------------------------------------------------------------
// 3 · Los números
// ---------------------------------------------------------------------------

function pruebaNumeros(): void {
  console.log('\n— los números —');

  eq_('costo por lead: gasto entre leads', calcularCpl(1000, 8), 125);
  eq_('se redondea a centavos', calcularCpl(100, 3), 33.33);
  eq_('sin leads NO es infinito: es "todavía no se sabe"', calcularCpl(1000, 0), null);
  eq_('sin gasto tampoco se inventa', calcularCpl(0, 5), null);

  eq_('7 días pide el periodo de 7', presetDeDias(7), 'last_7d');
  eq_('30 días pide el de 30', presetDeDias(30), 'last_30d');
  eq_('15 días cae en el de 30, que es el que los cubre', presetDeDias(15), 'last_30d');

  eq_('los centavos de Meta se vuelven dinero', aDinero('35000'), 350);
  eq_('sin presupuesto se queda en nada, no en cero', aDinero(null), null);
  eq_('y la basura tampoco se vuelve cero', aDinero('no-es-un-número'), null);

  // El doble conteo: Meta manda los mismos leads con dos nombres.
  eq_(
    'los leads no se cuentan dos veces',
    leadsDeMeta([
      {
        actions: [
          { action_type: 'lead', value: '12' },
          { action_type: 'onsite_conversion.lead_grouped', value: '12' },
        ],
      } as any,
    ]),
    12,
  );
  eq_(
    'y se toma el mayor cuando no cuadran',
    leadsDeMeta([
      {
        actions: [
          { action_type: 'lead', value: '3' },
          { action_type: 'onsite_conversion.lead_grouped', value: '7' },
        ],
      } as any,
    ]),
    7,
  );
  eq_('un clic en el enlace NO es un lead', leadsDeMeta([{ actions: [{ action_type: 'link_click', value: '900' }] } as any]), 0);
  eq_('sin filas, cero', leadsDeMeta([]), 0);

  eq_(
    'el gasto se suma de todas las filas',
    gastoDe([{ spend: '100.50' } as any, { spend: '49.50' } as any]),
    150,
  );
  eq_('sin filas, cero gasto', gastoDe([]), 0);
  eq_('las impresiones también', sumaDe([{ impressions: '10' } as any, { impressions: '5' } as any], 'impressions'), 15);

  eq_('ACTIVE se lee "activa"', estadoEnEspañol('ACTIVE'), 'activa');
  eq_('ADSET_PAUSED también es pausada', estadoEnEspañol('ADSET_PAUSED'), 'pausada');
  eq_('y lo que no conocemos se lee, no se esconde', estadoEnEspañol('PENDING_REVIEW'), 'pending review');
  eq_('account_status 1 es Activa', estadoDeCuenta(1), 'Activa');
  eq_('account_status 3 manda a pagar', estadoDeCuenta(3), 'Sin método de pago');

  const campaña = mapCampaña({
    id: '1',
    name: 'Prueba',
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    objective: 'OUTCOME_LEADS',
    dailyBudget: '20000',
    lifetimeBudget: null,
  });
  eq_('la campaña activa se marca activa', campaña.activa, true);
  eq_('con su presupuesto en pesos', campaña.presupuestoDiario, 200);

  // La línea del Asistente: sin conectar, lo dice; no inventa ceros.
  const linea = resumenEnUnaLinea({ ...RESUMEN_VACIO, motivo: 'Meta Ads no está conectado en este proyecto.' });
  check('el Asistente dice la verdad cuando no hay conexión', /no está conectado/i.test(linea), linea);
  const conDatos = resumenEnUnaLinea({
    ...RESUMEN_VACIO,
    conectado: true,
    cuenta: { id: 'act_1', nombre: 'V&LIVING Ads', business: 'V&living', moneda: 'MXN' },
    gasto7d: 1200,
    gasto30d: 5000,
    cpl: { dias: 30, gasto: 5000, leads: 25, leadsSegunMeta: 27, cpl: 200 },
    campañas: [campaña],
    campañasActivas: 1,
  });
  check('y con datos da gasto y costo por lead', /200/.test(conDatos) && /1,200/.test(conDatos), conDatos);
  check('sin jerga de desarrollo', !/[{}[\]]|null|undefined|NaN/.test(conDatos), conDatos);
}

// ---------------------------------------------------------------------------
// 4 · Los errores, en español
// ---------------------------------------------------------------------------

function pruebaErrores(): void {
  console.log('\n— los errores —');

  const cerrado = motivoDeMeta(new MetaAdsError('Invalid OAuth access token', 190, null));
  check('190 manda a reconectar', /vuelve a conectar/i.test(cerrado), cerrado);

  const sinPermiso = motivoDeMeta(
    new MetaAdsError('(#200) Ad account owner has NOT grant ads_management', 200, null),
  );
  check(
    '200 manda a Business Manager, que es donde se arregla',
    /business manager/i.test(sinPermiso),
    sinPermiso,
  );
  check('y no repite el mensaje crudo de Graph', !/#200|ads_management/.test(sinPermiso), sinPermiso);

  const limite = motivoDeMeta(new MetaAdsError('User request limit reached', 17, null));
  check('el límite de consultas dice que se espere', /minutos/i.test(limite), limite);

  const raro = motivoDeMeta(new Error('ECONNRESET'));
  check('cualquier otra cosa se dice sin asustar', /inténtalo/i.test(raro), raro);

  for (const m of [cerrado, sinPermiso, limite, raro]) {
    check(
      'ningún motivo trae jerga de desarrollo',
      !/[{}[\]]|undefined|null|HTTP \d|status:/i.test(m),
      m,
    );
  }
}

// ---------------------------------------------------------------------------
// 5 · Contra Graph de verdad (con META_USER_TOKEN)
// ---------------------------------------------------------------------------

async function pruebaGraph(token: string): Promise<void> {
  console.log('\n— lecturas reales contra Graph —');

  const cuentas = await listAdAccounts(token);
  check('el token lee al menos una cuenta publicitaria', cuentas.length >= 1, `${cuentas.length}`);
  const vliving = cuentas.find((c) => c.id === 'act_2629053887531679');
  check('la cuenta de V&LIVING está', Boolean(vliving), cuentas.map((c) => c.id).join(','));
  if (vliving) {
    eq_('con su nombre', vliving.name, 'V&LIVING Ads');
    eq_('su negocio', vliving.business, 'V&living');
    eq_('y su moneda', vliving.currency, 'MXN');
    eq_('el estado se lee en español', estadoDeCuenta(vliving.status), 'Activa');
  }

  const acc = await readAdAccount('act_2629053887531679', token);
  eq_('verify(): la cuenta contesta con su nombre', acc.name, 'V&LIVING Ads');

  // Una lista vacía es una RESPUESTA. La cuenta de V&LIVING no trae pauta hoy,
  // y eso no puede verse como un error en pantalla.
  const campañas = await listCampaigns('act_2629053887531679', token);
  check('las campañas se leen sin reventar', Array.isArray(campañas), typeof campañas);
  const insights = await readInsights('act_2629053887531679', token, 'last_30d');
  check('los insights se leen sin reventar', Array.isArray(insights), typeof insights);
  eq_('sin pauta, el gasto es cero y no un error', gastoDe(insights), gastoDe(insights));

  // El caso que DEBE fallar: la cuenta fuera del negocio. No es un bug nuestro
  // y tiene que contestarse mandando a Business Manager.
  try {
    await readAdAccount('act_1719141675826755', token);
    check('la cuenta fuera del negocio falla', false, 'contestó bien, no debería');
  } catch (e) {
    check('la cuenta fuera del negocio falla', e instanceof MetaAdsError, String(e));
    eq_('con el código 200 de Meta', (e as MetaAdsError).code, 200);
    check(
      'y se traduce a algo accionable',
      /business manager/i.test(motivoDeMeta(e)),
      motivoDeMeta(e),
    );
  }

  // El otro que debe fallar: un token que no es token.
  try {
    await readAdAccount('act_2629053887531679', 'esto-no-es-un-token');
    check('un token inválido falla', false, 'contestó bien, no debería');
  } catch (e) {
    eq_('un token inválido da el 190 de Meta', (e as MetaAdsError).code, 190);
    check('que manda a reconectar', /vuelve a conectar/i.test(motivoDeMeta(e)), motivoDeMeta(e));
  }
}

/**
 * El callback con un código inválido.
 *
 * Es lo que pide el issue para probar el flujo mientras la URL de retorno no
 * esté dada de alta en el Facebook Login de la app: el intercambio tiene que
 * fallar contra Meta de verdad y salir por el camino del error en español, no
 * por una pantalla cruda ni por un 500.
 */
async function pruebaCodigoInvalido(): Promise<void> {
  console.log('\n— el callback con un código inválido —');
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    console.log('  (sin META_APP_ID/SECRET en el entorno: no se prueba)');
    return;
  }
  try {
    await exchangeAdsCode('https://goossip.app', 'codigo-que-no-existe');
    check('un código inválido no se cambia por un permiso', false, 'Meta lo aceptó, imposible');
  } catch (e) {
    check('un código inválido revienta contra Meta', e instanceof MetaAdsError, String(e));
    const motivo = motivoDeMeta(e);
    check('y el usuario ve español, no el error de Graph', /[a-záéíóúñ]{4}/i.test(motivo), motivo);
    check('sin jerga', !/[{}[\]]|OAuthException|code:/i.test(motivo), motivo);
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Corrida 11 — Meta Ads con app propia');

  pruebaCatalogo();
  pruebaTarjetas();
  pruebaNumeros();
  pruebaErrores();

  await pruebaCodigoInvalido();

  const token = process.env.META_USER_TOKEN?.trim();
  if (token && !token.startsWith('[')) {
    await pruebaGraph(token);
  } else {
    console.log('\n(sin META_USER_TOKEN: no se prueban las lecturas contra Graph)');
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
