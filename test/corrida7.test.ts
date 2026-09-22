/**
 * Pruebas de la corrida 7 — herramientas del proyecto, prospección por Maps,
 * visor con aprobación y autonomía.
 *
 *   npx tsx test/corrida7.test.ts
 *
 * Qué se prueba y por qué cada una está aquí:
 *
 *  1. LAS TRES CORRECCIONES QUE PIDIÓ LUIS. Que el checklist lea Facebook e
 *     Instagram de Composio y no el conector `meta` apagado (era el bug: seis
 *     cuentas vivas y el Inicio decía que no); que la caja de plantillas de
 *     WhatsApp esté apagada en los TRES lugares; y que reconciliar contra
 *     Composio encienda lo que existe allá y apague lo que ya no.
 *  2. PROSPECCIÓN. Idempotencia por `place_id`, el tope de búsquedas, el CSV,
 *     que el enriquecimiento no confunda una regla de CSS con un correo y que
 *     el robots.txt del negocio se respete.
 *  3. COMPETENCIA. Que el ritmo se calcule sobre los días REALES de la muestra
 *     y no sobre una ventana fija, que un perfil personal se rechace en la
 *     puerta, y que el veredicto NO se invente una comparación cuando falta la
 *     mitad de los números.
 *  4. VISOR Y APROBACIÓN. Los formatos con su fuente oficial, el corte del
 *     "ver más", y la máquina de estados: lo que se puede y lo que no.
 *  5. AUTONOMÍA. Que las compuertas duras NO se abran en el nivel 4 —que es lo
 *     único que las hace compuertas— y que subir de nivel no pase solo.
 *  6. LECCIONES. Que solo se guarden con una corrección de verdad.
 *  7. UN CASO QUE DEBE FALLAR, a mano: una transición inválida tiene que
 *     tronar, no colarse.
 *
 * Todo lo que crea en la base se borra al final, pase o falle.
 */
import '../src/env';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  campaigns,
  competitorSnapshots,
  creativePieces,
  lessons,
  organizations,
  projectCompetitors,
  prospectSearches,
  prospects,
  users,
  type Project,
} from '../src/db/schema';
import { buildChannelCards, metaConectado } from '../src/projects/connections';
import { projectHome } from '../src/projects/home';
import { whatsappHabilitado } from '../src/banderas';
import { toolsParaProyecto } from '../src/agent/project-tools';
import {
  comoCsv,
  mejorCorreo,
  robotsPermite,
  soloTextoVisible,
  topeDeBusquedas,
  TOPE_POR_OMISION,
} from '../src/prospeccion/maps';
import {
  esPerfilPersonal,
  limpiarHandles,
  ritmoDe,
  veredictos,
  type FilaComparativa,
  type PublicacionLeida,
} from '../src/competencia/lectura';
import { formatosDelVisor, lunesDe, vistaPrevia } from '../src/creative/visor';
import { ESTADO_LABEL, moverPieza, puedeIr, TRANSICIONES } from '../src/creative/repo';
import {
  COMPUERTAS_DURAS,
  NIVEL,
  autoPublicaEn,
  nivelComoTexto,
  nivelDe,
  progresoDeAutonomia,
  puedeSolo,
} from '../src/autonomia/niveles';
import { guardarLeccion, queAprendi, redactarLeccion } from '../src/autonomia/lecciones';
import { metricasDeGoossip } from '../src/autonomia/metricas';

let pasadas = 0;
const fallidas: string[] = [];

function ok(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) pasadas += 1;
  else fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const SUFIJO = `c7-${Date.now()}`;
const ORG = `org_${SUFIJO}`;
const creados = { proyectos: [] as string[], usuarios: [] as string[] };

async function montarProyecto(nombre: string, rules: Record<string, unknown> = {}): Promise<Project> {
  await db.insert(organizations).values({ id: ORG, name: `Prueba ${SUFIJO}` }).onConflictDoNothing();
  const [u] = await db
    .insert(users)
    .values({ clerkId: `user_${SUFIJO}_${nombre}`, email: `${nombre}@prueba-${SUFIJO}.mx` })
    .returning();
  creados.usuarios.push(u!.id);
  const [p] = await db
    .insert(campaigns)
    .values({
      orgId: ORG,
      userId: u!.id,
      name: nombre,
      slug: `${nombre.toLowerCase()}-${SUFIJO}`,
      kind: 'servicios',
      rules: rules as never,
    })
    .returning();
  creados.proyectos.push(p!.id);
  return p!;
}

async function limpiar() {
  if (creados.proyectos.length) {
    await db.delete(lessons).where(inArray(lessons.projectId, creados.proyectos));
    await db.delete(competitorSnapshots).where(inArray(competitorSnapshots.projectId, creados.proyectos));
    await db.delete(projectCompetitors).where(inArray(projectCompetitors.projectId, creados.proyectos));
    await db.delete(prospects).where(inArray(prospects.projectId, creados.proyectos));
    await db.delete(prospectSearches).where(inArray(prospectSearches.projectId, creados.proyectos));
    await db.delete(creativePieces).where(inArray(creativePieces.projectId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
  }
  if (creados.usuarios.length) await db.delete(users).where(inArray(users.id, creados.usuarios));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

// ---------------------------------------------------------------------------
// 1. Las tres correcciones que pidió Luis
// ---------------------------------------------------------------------------

function cuenta(platform: string, extra: Record<string, unknown> = {}) {
  const ahora = new Date();
  return {
    id: `fake-${platform}`,
    orgId: ORG,
    campaignId: null,
    userId: null,
    platform,
    status: 'connected',
    label: `Cuenta de ${platform}`,
    externalHandle: null,
    externalId: null,
    metadata: { via: 'composio', connected_account_id: `ca_${platform}` },
    connectedBy: 'prueba',
    connectedAt: ahora,
    verifiedAt: ahora,
    createdAt: ahora,
    updatedAt: ahora,
    ...extra,
  } as never;
}

async function pruebaCorreccionUno(project: Project) {
  // EL BUG: `meta` (la app propia) está apagado desde la corrida 5, así que su
  // tarjeta ni existe. Preguntarle a él era preguntarle a un canal muerto.
  const conFbIg = buildChannelCards(project, [cuenta('facebook'), cuenta('instagram')]);
  const m = metaConectado(conFbIg.cards);
  ok('con Facebook e Instagram vivos, Meta cuenta como conectado', m.conectado);
  ok('y dice CUÁLES', m.cuales.length === 2, `${m.cuales.map((c) => c.id).join(',')}`);

  const sinNada = buildChannelCards(project, []);
  ok('sin cuentas, Meta NO cuenta como conectado', !metaConectado(sinNada.cards).conectado);

  // Una cuenta conectada pero con la verificación vieja NO pinta verde, y por
  // lo tanto tampoco cuenta para el checklist: verde es una promesa.
  const vieja = buildChannelCards(project, [
    cuenta('facebook', { verifiedAt: new Date(Date.now() - 48 * 3600_000) }),
  ]);
  ok(
    'una verificación de hace 48 h no cuenta como conectado',
    !metaConectado(vieja.cards).conectado,
  );

  // Y el total del "N de M" existe y es todo el catálogo, no solo lo conectable.
  ok('la franja sabe su total', conFbIg.total >= 24, `${conFbIg.total}`);
  ok(
    'conectables <= total',
    conFbIg.conectables <= conFbIg.total,
    `${conFbIg.conectables}/${conFbIg.total}`,
  );

  const home = await projectHome(project);
  const paso = home.checklist.find((s) => s.id === 'meta');
  ok('el checklist trae el paso de Meta', Boolean(paso));
  ok('el Inicio trae las 8 herramientas', home.herramientas.length === 8, `${home.herramientas.length}`);
  ok(
    'cada herramienta dice su estado',
    home.herramientas.every((h) => h.estado.trim().length > 0),
  );
}

function pruebaCorreccionDos(project: Project) {
  // Con la bandera abajo —que es como está por decisión de Luis— WhatsApp no
  // existe para el Asistente. Esconder el botón y dejar la tool viva sería
  // esconder el interruptor.
  ok('WhatsApp está apagado por omisión', !whatsappHabilitado());

  const tools = toolsParaProyecto({
    project,
    orgId: ORG,
    quien: 'prueba@goossip.mx',
    puedeOperar: true,
    kit: null,
  });
  ok(
    'con la bandera abajo, el Asistente NO tiene la tool de WhatsApp',
    !('mandarWhatsapp' in tools),
    Object.keys(tools).join(','),
  );
  ok('pero sí tiene las nuevas de la corrida 7', 'buscarNegocios' in tools && 'leerCompetencia' in tools);
  ok(
    'y ninguna tool acepta un projectId de fuera',
    Object.values(tools).every((t) => {
      const shape = (t as { inputSchema?: { shape?: Record<string, unknown> } }).inputSchema?.shape;
      return !shape || !('projectId' in shape);
    }),
  );
}

// ---------------------------------------------------------------------------
// 2. Prospección
// ---------------------------------------------------------------------------

async function pruebaProspeccion(project: Project) {
  ok('el tope por omisión es 50', topeDeBusquedas(project) === TOPE_POR_OMISION);

  const conTope = { ...project, rules: { maps_search_cap: 7 } } as Project;
  ok('el tope sale de las reglas del proyecto', topeDeBusquedas(conTope) === 7);

  const negativo = { ...project, rules: { maps_search_cap: -3 } } as Project;
  ok('un tope negativo cae al de omisión', topeDeBusquedas(negativo) === TOPE_POR_OMISION);

  // --- el correo: lo que costó dos vueltas contra sitios reales -------------
  const conCss = soloTextoVisible(
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..600">
     <style>@font-face{src:url(x.woff2)}</style>
     <a href="mailto:hola@restaurante.mx">escríbenos</a>`,
  );
  ok('el barrido quita los <link> de fuentes', !conCss.includes('wght@400'));
  ok('y deja el mailto del negocio', conCss.includes('hola@restaurante.mx'));

  // Los `<script>` SE QUEDAN: los sitios de Wix guardan ahí su contenido, y
  // tirarlos dejaba en cero a la mitad de los negocios. Medido.
  const conScript = soloTextoVisible('<script>{"email":"contacto@negocio.mx"}</script>');
  ok('los <script> se quedan (ahí vive el contenido de Wix)', conScript.includes('contacto@negocio.mx'));

  ok(
    'gana el correo del DOMINIO del negocio',
    mejorCorreo(
      ['JustinB@harvest.org', 'admin@afloratulum.com', 'vincent.loy1@gmail.com'],
      'https://www.afloratulum.com/panza',
      [],
    ) === 'admin@afloratulum.com',
  );
  ok(
    'los correos de plantilla se descartan',
    mejorCorreo(['user@domain.com', 'real@negocio.mx'], 'https://negocio.mx', []) === 'real@negocio.mx',
  );
  ok(
    'sin candidatos limpios devuelve null',
    mejorCorreo(['noreply@wordpress.com'], 'https://x.mx', []) === null,
  );

  // --- el CSV ---------------------------------------------------------------
  const csv = comoCsv([
    {
      id: 'x',
      orgId: ORG,
      projectId: project.id,
      placeId: 'p1',
      name: 'La Casa, S.A.',
      address: 'Calle "Sol" 1',
      phone: '984 000 0000',
      website: null,
      rating: '4.8',
      ratingsCount: 12,
      category: 'Restaurante',
      lat: null,
      lng: null,
      mapsUrl: null,
      source: 'google_maps',
      status: 'nuevo',
      enrichment: { email: 'a@b.mx' },
      searchId: null,
      leadId: null,
      foundAt: new Date(),
      updatedAt: new Date(),
    } as never,
  ]);
  ok('el CSV escapa las comas del nombre', csv.includes('"La Casa, S.A."'));
  ok('el CSV escapa las comillas', csv.includes('""Sol""'));
  ok('el CSV trae el correo enriquecido', csv.includes('a@b.mx'));

  // --- robots.txt -----------------------------------------------------------
  // Un dominio que no existe no tiene robots.txt: no tenerlo es permitir.
  const permite = await robotsPermite('https://no-existe-esto-de-verdad-123.mx/');
  ok('sin robots.txt legible, se permite', permite === true);
}

// ---------------------------------------------------------------------------
// 3. Competencia
// ---------------------------------------------------------------------------

function post(diasAtras: number): PublicacionLeida {
  return {
    id: `p${diasAtras}`,
    texto: 'hola',
    cuando: new Date(Date.now() - diasAtras * 86_400_000),
    formato: 'imagen',
    url: null,
  };
}

function pruebaCompetencia() {
  // EL punto del cálculo: se divide entre los días REALES de la muestra. Diez
  // posts que abarcan 70 días son 1 por semana, no 10.
  const r = ritmoDe([post(70), post(42), post(35), post(28), post(21), post(14), post(7), post(0)]);
  ok('el ritmo sale de los días de la muestra', r.porSemana === 0.7, `${r.porSemana}`);
  ok('cuenta los posts', r.posts === 8);
  ok('sabe cuál fue el último', r.ultimo !== null);

  // Menos de dos fechas no es un ritmo, es un post.
  ok('un solo post no da ritmo', ritmoDe([post(3)]).porSemana === null);

  // El caso donde el sesgo SÍ importa: dos posts con una semana de diferencia
  // son 1 por semana, no 2. Contar posts en vez de intervalos lo duplicaba, y
  // dos posts es justo lo que se logra leer de una cuenta chica.
  ok('dos posts a una semana son 1 por semana', ritmoDe([post(7), post(0)]).porSemana === 1, `${ritmoDe([post(7), post(0)]).porSemana}`);
  ok('cero posts no da ritmo', ritmoDe([]).porSemana === null);

  // Varios posts del mismo rato tampoco: dividir entre 0.01 días daría 700 por
  // semana, que es el número que impresiona y no significa nada.
  const mismoDia = ritmoDe([
    { ...post(0), id: 'a' },
    { ...post(0), id: 'b' },
    { ...post(0), id: 'c' },
  ]);
  ok('tres posts del mismo rato no dan ritmo', mismoDia.porSemana === null, `${mismoDia.porSemana}`);

  ok('cuenta los formatos', ritmoDe([post(1), post(2)]).formatos.imagen === 2);

  // --- perfiles personales: se rechazan en la PUERTA ------------------------
  ok('un /in/ de LinkedIn es personal', esPerfilPersonal('linkedin', 'https://linkedin.com/in/luis'));
  ok(
    'una /company/ de LinkedIn no lo es',
    !esPerfilPersonal('linkedin', 'https://www.linkedin.com/company/lamudi/'),
  );
  ok('un profile.php de Facebook es personal', esPerfilPersonal('facebook', 'facebook.com/profile.php?id=1'));

  const limpios = limpiarHandles({
    linkedin: 'https://linkedin.com/in/alguien',
    facebook: 'LamudiMexico',
    instagram: 'lamudimx',
  });
  ok('limpiarHandles tira el perfil personal', !('linkedin' in limpios));
  ok('y conserva las páginas de negocio', limpios.facebook === 'LamudiMexico' && limpios.instagram === 'lamudimx');

  // --- el veredicto NO inventa ---------------------------------------------
  const base = {
    fuente: 'composio' as const,
    motivo: null,
    posts: 20,
    ultimo: null,
    formatos: {},
    seguidores: null,
    leidoEn: new Date().toISOString(),
  };
  const conRival: FilaComparativa[] = [
    { ...base, quien: 'Tú', esTuyo: true, red: 'instagram', porSemana: 1 },
    { ...base, quien: 'Rival', esTuyo: false, red: 'instagram', porSemana: 5, fuente: 'web' },
  ];
  const v1 = veredictos(conRival);
  ok('con los dos números, compara', v1.some((t) => t.includes('5') && t.includes('1')), v1.join(' | '));
  ok('y dice cuánto le lleva', v1.some((t) => t.includes('Te lleva')), v1.join(' | '));

  const sinRival: FilaComparativa[] = [
    { ...base, quien: 'Tú', esTuyo: true, red: 'facebook', porSemana: 4 },
    { ...base, quien: 'Rival', esTuyo: false, red: 'facebook', porSemana: null, fuente: 'ninguna' },
  ];
  const v2 = veredictos(sinRival);
  ok(
    'sin el número del rival NO se inventa la comparación',
    v2.every((t) => !t.includes('Te lleva')),
    v2.join(' | '),
  );
  ok(
    'y se dice POR QUÉ falta',
    v2.some((t) => t.includes('revisión de app')),
    v2.join(' | '),
  );

  // Vas arriba también se dice: un panel que solo da malas noticias se apaga.
  const vasArriba: FilaComparativa[] = [
    { ...base, quien: 'Tú', esTuyo: true, red: 'instagram', porSemana: 7 },
    { ...base, quien: 'Rival', esTuyo: false, red: 'instagram', porSemana: 2, fuente: 'web' },
  ];
  ok('cuando vas arriba, lo dice', veredictos(vasArriba).some((t) => t.includes('Vas arriba')));
}

// ---------------------------------------------------------------------------
// 4. Visor y aprobación
// ---------------------------------------------------------------------------

function pruebaVisor() {
  const fs = formatosDelVisor();
  ok('el visor enseña al menos 6 formatos', fs.length >= 6, `${fs.length}`);
  for (const f of fs) {
    ok(`${f.id} cita su fuente oficial`, f.fuente.startsWith('https://'), f.fuente);
    ok(`${f.id} trae fecha de lectura`, /^\d{4}-\d{2}-\d{2}$/.test(f.leidoEl), f.leidoEl);
    ok(`${f.id} tiene lienzo`, f.ancho > 0 && f.alto > 0);
  }
  const redes = new Set(fs.map((f) => f.red));
  ok(
    'cubre Facebook, Instagram, LinkedIn, X, TikTok y YouTube',
    ['facebook', 'instagram', 'linkedin', 'twitter', 'tiktok', 'youtube'].every((r) => redes.has(r as never)),
    [...redes].join(','),
  );

  // El corte del "ver más": lo escondido NO se pierde, se enseña apagado.
  const largo = 'a'.repeat(400);
  const p = vistaPrevia({ red: 'facebook', formatoId: 'facebook-feed', texto: largo });
  ok('detecta el corte', p.cortado);
  ok('el visible llega al límite', p.visible.length === p.limite, `${p.visible.length}`);
  ok('lo escondido es el resto', p.visible.length + p.oculto.length === 400);
  // Sin distinguir mayúsculas desde la corrida 10: el aviso ahora cita la
  // etiqueta REAL del botón de cada red, y la de Facebook es "Ver más" con
  // mayúscula. Lo que esta línea comprueba es que el aviso nombre el botón, no
  // cómo lo escribe Facebook.
  ok(
    'avisa del corte',
    p.avisos.some((a) => a.severidad === 'aviso' && /ver más/i.test(a.texto)),
    p.avisos.map((a) => `${a.severidad}:${a.texto.slice(0, 60)}`).join(' | '),
  );

  const corto = vistaPrevia({ red: 'facebook', formatoId: 'facebook-feed', texto: 'hola' });
  ok('un texto corto no se corta', !corto.cortado && corto.oculto === '');

  const conHashtags = vistaPrevia({
    red: 'instagram',
    formatoId: 'instagram-feed-45',
    texto: Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' '),
  });
  ok(
    'pasarse de hashtags es ERROR, no aviso',
    conHashtags.avisos.some((a) => a.severidad === 'error' && a.texto.includes('hashtags')),
  );

  const vacio = vistaPrevia({ red: 'facebook', formatoId: 'facebook-feed', texto: '   ' });
  ok('una pieza sin texto es error', vacio.avisos.some((a) => a.severidad === 'error'));

  const historia = vistaPrevia({ red: 'instagram', formatoId: 'instagram-historia', texto: 'hola' });
  ok('la historia trae zona segura en píxeles', historia.zonaSegura.abajo > 0, `${historia.zonaSegura.abajo}`);

  // --- la máquina de estados ------------------------------------------------
  ok('de borrador se puede ir a revisión', puedeIr('propuesta', 'en_revision'));
  ok('de revisión se puede aprobar', puedeIr('en_revision', 'aprobada'));
  ok('de aprobada se puede programar', puedeIr('aprobada', 'programada'));
  ok('de programada se puede publicar', puedeIr('programada', 'publicada'));
  ok('EL CASO QUE DEBE FALLAR: de publicada no se vuelve a borrador', !puedeIr('publicada', 'propuesta'));
  ok('ni de publicada a nada', TRANSICIONES.publicada.length === 0);
  ok('de borrador no se salta a publicada', !puedeIr('propuesta', 'publicada'));
  ok('todos los estados tienen etiqueta en español', Object.keys(TRANSICIONES).every((e) => Boolean(ESTADO_LABEL[e as never])));
}

async function pruebaFlujoDePieza(project: Project) {
  const [pieza] = await db
    .insert(creativePieces)
    .values({
      orgId: ORG,
      projectId: project.id,
      red: 'instagram',
      formato: 'instagram-feed-45',
      tipo: 'imagen',
      brief: 'lanzamiento de temporada',
      prompt: 'x',
      motor: 'sharp',
      url: 'https://ejemplo.mx/pieza.jpg',
    })
    .returning();

  const a = await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'en_revision',
    quien: 'luis@prueba.mx',
  });
  ok('la pieza pasa a revisión', a?.pieza.estado === 'en_revision');
  ok('y recuerda de dónde venía', a?.antes === 'propuesta');

  // Pedir cambios SIN decir cuáles tiene que tronar: sin el porqué no es una
  // corrección, es un no — y es justo el texto que se guarda como lección.
  let tronó = false;
  await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'cambios',
    quien: 'luis@prueba.mx',
  }).catch(() => {
    tronó = true;
  });
  ok('EL CASO QUE DEBE FALLAR: pedir cambios sin comentario truena', tronó);

  const b = await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'cambios',
    quien: 'luis@prueba.mx',
    comentario: 'el logo va arriba a la izquierda, no abajo',
  });
  ok('con comentario sí pasa', b?.pieza.estado === 'cambios');
  ok('y se guarda lo que pidieron', b?.pieza.comentario?.includes('logo'));

  const c = await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'en_revision',
    quien: 'luis@prueba.mx',
  });
  ok('volver a revisión limpia el comentario viejo', c?.pieza.comentario === null);

  await moverPieza({ orgId: ORG, projectId: project.id, id: pieza!.id, a: 'aprobada', quien: 'luis@prueba.mx' });

  // Programar sin fecha también truena: "programada" sin cuándo no significa nada.
  let sinFecha = false;
  await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'programada',
    quien: 'luis@prueba.mx',
  }).catch(() => {
    sinFecha = true;
  });
  ok('EL CASO QUE DEBE FALLAR: programar sin fecha truena', sinFecha);

  const cuando = new Date(Date.now() + 86_400_000);
  const d = await moverPieza({
    orgId: ORG,
    projectId: project.id,
    id: pieza!.id,
    a: 'programada',
    quien: 'luis@prueba.mx',
    programadaPara: cuando,
  });
  ok('con fecha sí se programa', d?.pieza.estado === 'programada');
  ok('y guarda cuándo sale', d?.pieza.programadaPara?.getTime() === cuando.getTime());

  // Y la semana: el lunes de un domingo es SEIS días atrás, no el día siguiente.
  const domingo = new Date('2026-09-20T15:00:00');
  ok('el lunes de un domingo es 6 días atrás', lunesDe(domingo).getDate() === 14, `${lunesDe(domingo).toDateString()}`);
  const miercoles = new Date('2026-09-16T15:00:00');
  ok('el lunes de un miércoles es 2 días atrás', lunesDe(miercoles).getDate() === 14);
  ok('el lunes arranca a las 00:00', lunesDe(miercoles).getHours() === 0);
}

// ---------------------------------------------------------------------------
// 5. Autonomía
// ---------------------------------------------------------------------------

async function pruebaAutonomia() {
  const n1 = await montarProyecto('Nivel1');
  const n2 = await montarProyecto('Nivel2', { autonomy_level: 2, auto_publish: ['instagram'] });
  const n4 = await montarProyecto('Nivel4', { autonomy_level: 4, autonomy_daily_budget: 500 });

  ok('sin regla, el nivel es 1', nivelDe(n1) === 1);
  ok('el nivel sale de las reglas', nivelDe(n2) === 2 && nivelDe(n4) === 4);
  ok(
    'un nivel inventado cae a 1',
    nivelDe({ ...n1, rules: { autonomy_level: 9 } } as Project) === 1,
  );

  ok('en nivel 1 no publica solo', !puedeSolo(n1, 'publicar_organico').puede);
  ok('en nivel 2 sí publica solo', puedeSolo(n2, 'publicar_organico').puede);
  ok('en nivel 2 NO contesta leads solo', !puedeSolo(n2, 'responder_lead').puede);
  ok('en nivel 4 sí opera campañas', puedeSolo(n4, 'operar_campana').puede);

  /**
   * ESTO es lo que hace que una compuerta sea compuerta: el nivel más alto
   * tampoco la abre.
   *
   * La lista va ESCRITA AQUÍ y no se recorre `COMPUERTAS_DURAS`. La primera
   * versión sí la recorría y se vio por qué no sirve: se le quitó
   * `mover_presupuesto` a la lista a mano, y la prueba —que iteraba esa misma
   * lista— simplemente dejó de comprobarlo y siguió en verde. Una prueba que se
   * apoya en la lista que debe vigilar no vigila nada.
   */
  const DURAS = ['mover_presupuesto', 'prometer_precio', 'promesa_legal', 'mandar_whatsapp'] as const;
  for (const dura of DURAS) {
    ok(`"${dura}" está declarada como compuerta dura`, COMPUERTAS_DURAS.has(dura));
    ok(`ni el nivel 4 abre "${dura}"`, !puedeSolo(n4, dura).puede);
    ok(`ni el nivel 1 abre "${dura}"`, !puedeSolo(n1, dura).puede);
  }
  ok('no hay más compuertas de las declaradas', COMPUERTAS_DURAS.size === DURAS.length, `${COMPUERTAS_DURAS.size}`);
  ok(
    'y se dice por qué en español',
    puedeSolo(n4, 'mover_presupuesto').motivo.includes('compuerta dura'),
  );

  // `auto_publish` es POR RED, y hacen falta las dos cosas.
  ok('nivel 2 + red en auto_publish → publica', autoPublicaEn(n2, 'instagram'));
  ok('nivel 2 pero red fuera de la lista → no', !autoPublicaEn(n2, 'facebook'));
  ok('nivel 1 aunque la red esté en la lista → no', !autoPublicaEn({ ...n1, rules: { auto_publish: ['instagram'] } } as Project, 'instagram'));

  const p = await progresoDeAutonomia(n1);
  ok('un proyecto nuevo arranca sin racha', p.sinCorreccion === 0, `${p.sinCorreccion}`);
  ok('y NO se le sugiere subir', !p.sugerirSubir);
  ok('sabe cuál es el siguiente nivel', p.siguiente === 2);
  ok('el nivel 4 no tiene siguiente', (await progresoDeAutonomia(n4)).siguiente === null);

  const texto = nivelComoTexto(n4);
  ok('el modelo recibe su nivel', texto.includes('nivel 4'));
  ok('y el tope de gasto', texto.includes('500'));
  ok(
    'y las compuertas duras, siempre',
    texto.includes('NUNCA') && texto.toLowerCase().includes('whatsapp'),
  );
  ok('los cuatro niveles tienen nombre y explicación', Object.values(NIVEL).every((x) => x.nombre && x.hace && x.pide));

  return n1;
}

// ---------------------------------------------------------------------------
// 6. Lecciones y métricas
// ---------------------------------------------------------------------------

async function pruebaLecciones(project: Project) {
  const texto = redactarLeccion({
    kind: 'cambios_pedidos',
    queHizo: 'instagram · lanzamiento',
    queCorrigio: 'el logo va arriba',
  });
  ok('la lección lleva las palabras del usuario', texto.includes('el logo va arriba'));
  ok('y lo que Goossip hizo', texto.includes('lanzamiento'));

  const l = await guardarLeccion({
    project,
    kind: 'pieza_rechazada',
    queHizo: 'instagram · promo de verano',
    queCorrigio: 'no usamos la palabra barato',
    actor: 'luis@prueba.mx',
  });
  ok('la lección se guarda', Boolean(l.id));
  ok('cuelga del PROYECTO', l.projectId === project.id);
  ok('guarda quién corrigió', l.actor === 'luis@prueba.mx');

  const q = await queAprendi(project.id, 7);
  ok('el reporte semanal la cuenta', q.total === 1, `${q.total}`);
  ok('y la agrupa por tipo', q.porTipo.pieza_rechazada === 1);
  ok('y da un resumen en español', q.resumen.includes('corrigieron') || q.resumen.includes('corrigió'));

  // Ahora que hay una corrección, la racha se mide DESDE ella.
  const p = await progresoDeAutonomia(project);
  ok('el contador se reinicia con la corrección', p.ultimaCorreccion !== null);

  const vacio = await queAprendi(creados.proyectos[0]!, 7);
  ok('sin correcciones NO se felicita solo', vacio.total === 0 || !vacio.resumen.includes('excelente'));
}

async function pruebaMetricas(project: Project) {
  const m = await metricasDeGoossip(project, 30);
  ok('las métricas son del proyecto', m.dias === 30);
  ok('cuenta las piezas hechas', m.piezasHechas >= 1, `${m.piezasHechas}`);
  ok('el ahorro dice su cuenta', m.ahorro.cuenta.includes('×'), m.ahorro.cuenta);
  ok(
    'la tasa se calcula solo sobre lo DECIDIDO',
    m.aprobacionSinCambios.tasa === null ||
      (m.aprobacionSinCambios.tasa >= 0 && m.aprobacionSinCambios.tasa <= 100),
    `${m.aprobacionSinCambios.tasa}`,
  );
  // Sin nada publicado ni contactado, el ahorro tiene que ser 0 — no un número
  // bonito inventado.
  const vacio = await metricasDeGoossip(
    { ...project, id: creados.proyectos[creados.proyectos.length - 1]! } as Project,
    30,
  );
  ok('sin trabajo, el ahorro es 0', vacio.ahorro.horas === 0, `${vacio.ahorro.horas}`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Pruebas de la corrida 7 — herramientas, prospección, visor y autonomía\n');

  pruebaCompetencia();
  pruebaVisor();

  try {
    const project = await montarProyecto('Principal');
    await pruebaCorreccionUno(project);
    pruebaCorreccionDos(project);
    await pruebaProspeccion(project);
    await pruebaFlujoDePieza(project);
    await pruebaAutonomia();
    await pruebaLecciones(project);
    await pruebaMetricas(project);
  } catch (e) {
    fallidas.push(`explotó: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  } finally {
    await limpiar().catch((e) => console.error('limpiando:', e));
  }

  console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
  for (const f of fallidas) console.log(`  ✗ ${f}`);
  process.exit(fallidas.length > 0 ? 1 : 0);
}

void main();
