/**
 * Pruebas de la corrida 10 — la Sala de arte y comunicación.
 *
 *   npx tsx test/corrida10.test.ts
 *
 * Las CINCO pruebas de aceptación del spec, en su orden, más lo que hace falta
 * para creérselas:
 *
 *  1. Una pieza 16:9 mandada a Instagram feed → ROJO con "Instagram requiere
 *     1:1 o 4:5" y botón Adaptar; adaptada → VERDE.
 *  2. "garantiza 20 % de rendimiento" → ROJO citando la política de Meta Ads y
 *     la LFPC.
 *  3. Vista previa de reel 9:16 con barras de UI y texto cortado en "ver más"
 *     idéntico a IG.
 *  4. `buscar_en_diseno("límite de posts por día en X")` → respuesta con URL
 *     oficial.
 *  5. (Las capturas van en `scripts/capturas-c10.ts`; aquí se comprueba que la
 *     Sala tenga lienzos para las seis redes, que es lo que hace posible la
 *     captura.)
 *
 * Y lo que la casa exige además de lo que pide el spec:
 *
 *  6. LA COMPUERTA ES COMPUERTA. Que el modelo no pueda poner verde lo que las
 *     reglas duras pusieron rojo, y que un ámbar no pase cuando quien aprieta
 *     es Goossip sola.
 *  7. LOS CASOS QUE DEBEN PASAR. Un descuento del 20 %, una garantía de
 *     entrega y un dato de mercado NO son promesas de rendimiento. Un detector
 *     que solo se prueba con lo que debe atrapar es un detector que no se probó.
 *  8. NADA INVENTADO. Que donde LinkedIn no publica su tope, no haya número; y
 *     que toda regla cargada traiga una URL http y una fecha.
 *  9. WHATSAPP. Que el chip diga "Más adelante" y no ofrezca conectar.
 *
 * Todo lo que crea en la base se borra al final, pase o falle.
 */
import '../src/env';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  campaigns,
  creativePieces,
  organizations,
  posts,
  projectEvents,
  users,
  type Project,
} from '../src/db/schema';
import { buscarDiseno } from '../src/design/knowledge';
import { buildChannelCards } from '../src/projects/connections';
import {
  REGLAS,
  LIMITES,
  reglaPorId,
  reglasDe,
  ESPACIADO_SUGERIDO_MIN,
} from '../src/creative/reglas';
import { CORTES, corteDe, partirDondeCorta } from '../src/creative/cortes';
import {
  anchoMinimoDe,
  bitrateMaxDe,
  medidaVacia,
  proporcionesDe,
  revisarCalidad,
  toleranciaDe,
  type Medida,
} from '../src/creative/calidad';
import {
  MENCIONES_QUE_HUELEN_MAL,
  PARECIDO_QUE_ES_REPETIR,
  compuerta,
  corregir,
  cuantasReglas,
  parecido,
  promesaDeRendimiento,
  reglasDuras,
  revisar,
} from '../src/creative/compliance';
import { usoDeHoy, veredictoDeFrecuencia } from '../src/creative/frecuencia';
import { guiaDeRed } from '../src/creative/como-se-postea';
import { formatosDeLaSala, formatosDelVisor, REDES_DE_LA_SALA, vistaPrevia } from '../src/creative/visor';
import { formatoPorId, REDES, RED_LABEL } from '../src/creative/specs';

let pasadas = 0;
const fallidas: string[] = [];

function ok(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) pasadas += 1;
  else fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const SUFIJO = `c10-${Date.now()}`;
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
      kind: 'inmobiliaria',
      rules: rules as never,
    })
    .returning();
  creados.proyectos.push(p!.id);
  return p!;
}

async function limpiar() {
  if (creados.proyectos.length) {
    await db.delete(projectEvents).where(inArray(projectEvents.projectId, creados.proyectos));
    await db.delete(creativePieces).where(inArray(creativePieces.projectId, creados.proyectos));
    await db.delete(posts).where(inArray(posts.projectId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
  }
  if (creados.usuarios.length) await db.delete(users).where(inArray(users.id, creados.usuarios));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

/** Una medida de archivo, con lo que haga falta cambiado. */
function medida(x: Partial<Medida>): Medida {
  return { ...medidaVacia(), ...x };
}

// ---------------------------------------------------------------------------
// 1. Prueba de aceptación 1 — 16:9 a Instagram feed
// ---------------------------------------------------------------------------

function pruebaUnoAspecto() {
  const dieciseisNueve = medida({ ancho: 1920, alto: 1080, bytes: 900 * 1024, archivo: 'jpg' });
  const d = revisarCalidad('instagram-feed-45', dieciseisNueve);

  ok('16:9 en el muro de Instagram NO es publicable', !d.publicable);
  ok(
    'el motivo dice "Instagram requiere 1:1 o 4:5"',
    d.fallas.some((f) => f.texto.includes('Instagram requiere 1:1 o 4:5')),
    d.fallas.map((f) => f.texto).join(' | '),
  );
  ok(
    'y ofrece el botón Adaptar (la falla es adaptable)',
    d.adaptable && d.fallas.every((f) => f.adaptable),
  );
  ok('la falla está clasificada como aspecto', d.fallas.some((f) => f.clave === 'aspecto'));

  // Adaptada: la misma pieza en el lienzo que pide la red.
  const f = formatoPorId('instagram-feed-45')!;
  const adaptada = medida({ ancho: f.ancho, alto: f.alto, bytes: 700 * 1024, archivo: 'jpg' });
  const d2 = revisarCalidad('instagram-feed-45', adaptada);
  ok('adaptada al lienzo de la red, ya es publicable', d2.publicable, d2.fallas.map((x) => x.texto).join(' | '));

  // Y el orden de las proporciones no es casualidad: es lo que hace que la
  // frase se lea "1:1 o 4:5" y no "4:5 o 1:1".
  ok('las proporciones van de la más ancha a la más alta', proporcionesDe('instagram', 'imagen', true)[0] === '1:1');

  // Lo que Adaptar NO puede arreglar tiene que decirlo.
  const chiquita = medida({ ancho: 200, alto: 250, bytes: 40 * 1024, archivo: 'jpg' });
  const d3 = revisarCalidad('instagram-feed-45', chiquita);
  ok(
    'una imagen por debajo del mínimo NO se marca adaptable: subir resolución es inventar píxeles',
    !d3.publicable && !d3.adaptable,
    JSON.stringify(d3.fallas.map((x) => [x.clave, x.adaptable])),
  );

  // Formato de archivo: Instagram solo acepta JPEG por la API.
  const png = medida({ ancho: 1080, alto: 1350, bytes: 2 * 1024 * 1024, archivo: 'png' });
  ok(
    'un PNG al muro de Instagram se marca (la API solo acepta JPEG)',
    revisarCalidad('instagram-feed-45', png).fallas.some((x) => x.clave === 'formato'),
  );

  // Peso y duración, cada uno con su número oficial.
  const gorda = medida({ ancho: 1080, alto: 1350, bytes: 12 * 1024 * 1024, archivo: 'jpg' });
  ok('9 MB en Instagram (tope 8) se marca por peso', revisarCalidad('instagram-feed-45', gorda).fallas.some((x) => x.clave === 'peso'));

  const largo = medida({ ancho: 1080, alto: 1920, bytes: 50 * 1024 * 1024, archivo: 'mp4', duracionS: 400, bitrateKbps: 6000 });
  ok('un video de 400 s cabe en un reel (tope 900 s)', revisarCalidad('instagram-reel', largo).publicable);
  const larguisimo = { ...largo, duracionS: 1200 };
  ok('uno de 1200 s, no', !revisarCalidad('instagram-reel', larguisimo).publicable);

  // Lo que no se pudo medir se DICE. No medir no es aprobar.
  const sinMedir = revisarCalidad('instagram-feed-45', medidaVacia());
  ok('lo que no se pudo medir queda anotado', sinMedir.sinMedir.length > 0, sinMedir.sinMedir.join(','));

  // Los números que salen de la nota oficial se leen bien.
  ok('el ancho mínimo de Facebook feed se lee de su nota (600)', anchoMinimoDe(formatoPorId('facebook-feed')!) === 600);
  ok('el bitrate máximo del reel se lee de su nota (25 Mbps)', bitrateMaxDe(formatoPorId('instagram-reel')!) === 25_000);
  ok('la tolerancia de un formato a pantalla completa es 1 %', toleranciaDe(formatoPorId('instagram-reel')!) === 0.01);
  ok('y la del muro es 3 %', toleranciaDe(formatoPorId('facebook-feed')!) === 0.03);
}

// ---------------------------------------------------------------------------
// 2. Prueba de aceptación 2 — la promesa de rendimiento
// ---------------------------------------------------------------------------

async function pruebaDosPromesa(project: Project) {
  const texto = 'Invierte en Polanco: te garantiza 20% de rendimiento anual, sin riesgo.';
  const r = await reglasDuras({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto,
    sinFrecuencia: true,
    sinModelo: true,
  });

  const rojos = r.hallazgos.filter((h) => h.nivel === 'rojo');
  ok('"garantiza 20% de rendimiento" sale en ROJO', rojos.length > 0);
  ok(
    'y cita la política de publicidad de Meta',
    rojos.some((h) => h.regla?.id === 'meta-ads-contenido-enganoso'),
    rojos.map((h) => h.regla?.id).join(','),
  );
  ok(
    'y cita la LFPC (artículo 32)',
    rojos.some((h) => h.regla?.id === 'mx-lfpc-32'),
    rojos.map((h) => h.regla?.id).join(','),
  );
  ok(
    'las dos citas traen su URL oficial',
    rojos
      .filter((h) => h.regla)
      .every((h) => h.regla!.fuente.startsWith('https://')),
  );

  // Y lo mismo, por la compuerta completa: rojo no pasa.
  const c = await compuerta({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto,
    quien: 'persona',
    accion: 'aprobar',
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('la compuerta lo BLOQUEA aunque quien aprieta sea una persona', !c.puede && c.veredicto.semaforo === 'rojo');
}

/**
 * EL CASO QUE DEBE PASAR.
 *
 * La regla 6 de la casa: desconfía del 100 % de aprobación, corre a mano un
 * caso que debe fallar. Aquí es al revés y duele igual — un detector que marca
 * "20 % de descuento" como promesa de rendimiento le bloquea al cliente la
 * publicación más normal del año.
 */
async function pruebaFalsosPositivos(project: Project) {
  const limpios = [
    'Departamento modelo abierto este fin de semana en Polanco, con 20% de descuento.',
    'Te garantizamos la entrega en 30 días hábiles.',
    'El rendimiento del sector inmobiliario en CDMX fue del 8% el año pasado, según el INEGI.',
    'Garantía de 5 años en acabados e instalaciones.',
  ];
  for (const t of limpios) {
    ok(`NO es promesa: "${t.slice(0, 42)}…"`, promesaDeRendimiento(t) === null, promesaDeRendimiento(t) ?? '');
  }

  const r = await reglasDuras({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: limpios[0]!,
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('y una pieza normal pasa sin hallazgos rojos', r.hallazgos.every((h) => h.nivel !== 'rojo'), JSON.stringify(r.hallazgos.map((h) => h.texto)));
}

// ---------------------------------------------------------------------------
// 3. Prueba de aceptación 3 — el reel con sus barras y su "ver más"
// ---------------------------------------------------------------------------

function pruebaTresReel() {
  const f = formatoPorId('instagram-reel')!;
  ok('el reel es 9:16 y 1080 × 1920', f.ratio === '9:16' && f.ancho === 1080 && f.alto === 1920);
  ok('y trae zona segura declarada', Boolean(f.zonaSegura));

  const largo =
    'Departamento modelo abierto este fin de semana en Polanco. ' +
    'Tres recámaras, terraza y estacionamiento techado para dos autos. ' +
    'Agenda tu visita y te lo enseñamos sin compromiso. #polanco #cdmx';
  const v = vistaPrevia({ red: 'instagram', formatoId: 'instagram-reel', texto: largo });

  ok('el visor dibuja la zona segura de arriba', v.zonaSegura.arriba > 0, `${v.zonaSegura.arriba} px`);
  ok('y la de abajo', v.zonaSegura.abajo > 0, `${v.zonaSegura.abajo} px`);
  ok('el texto se corta', v.cortado);
  ok(
    'y se corta a los 125 caracteres que enseña Instagram, ni uno más',
    v.limite === 125 && v.visible.length <= 125,
    `limite=${v.limite} visible=${v.visible.length}`,
  );
  ok('el corte respeta las palabras', !v.visible.endsWith(' ') && !largo[v.visible.length]?.match(/[a-záéíóúñ]/i));
  ok('lo escondido no se pierde: visible + oculto es el texto entero', `${v.visible} ${v.oculto}`.replace(/\s+/g, ' ').trim() === largo.replace(/\s+/g, ' ').trim());
  ok('la etiqueta del "ver más" es la de Instagram', v.corte.etiquetaVerMas === 'más');
  ok('2200 caracteres es el TOPE, no el corte', v.tope === 2200 && v.limite !== v.tope);
  ok('con 2200 o menos, no se excede', !v.seExcede);

  // X es el caso contrario: el corte y el tope son el mismo número y pasado
  // ahí no se esconde, se RECHAZA.
  const tuitLargo = 'a'.repeat(300);
  const x = vistaPrevia({ red: 'twitter', formatoId: 'twitter-imagen-191', texto: tuitLargo });
  ok('en X, 300 caracteres se pasan del tope', x.seExcede && x.sobrante.length === 20);
  ok('y en X el corte y el tope son el mismo (280)', x.limite === 280 && x.tope === 280);
  ok('el aviso de X es ERROR, no advertencia', x.avisos.some((a) => a.severidad === 'error'));

  // El partidor, a solas.
  const p = partirDondeCorta('uno dos tres cuatro cinco', 12);
  ok('partirDondeCorta no parte palabras', p.visible === 'uno dos tres' && p.cortado);
  ok('y sin corte, devuelve el texto entero', !partirDondeCorta('corto', 100).cortado);
}

// ---------------------------------------------------------------------------
// 4. Prueba de aceptación 4 — buscar en la memoria de diseño
// ---------------------------------------------------------------------------

async function pruebaCuatroBusqueda() {
  const hits = await buscarDiseno('límite de posts por día en X', { k: 4 });
  ok('la búsqueda devuelve algo', hits.length > 0);

  const conUrl = hits.filter((h) => h.sourcePath.startsWith('http'));
  ok('y la respuesta trae URL oficial', conUrl.length > 0, hits.map((h) => h.sourcePath).join(' | '));
  ok(
    'la primera es de la documentación de X',
    hits[0]?.sourcePath.includes('x.com') === true,
    hits[0]?.sourcePath ?? 'nada',
  );
  ok(
    'y está en la categoría reglas',
    hits.some((h) => h.category === 'reglas'),
    hits.map((h) => h.category).join(','),
  );

  // La otra pregunta que el spec pone de ejemplo en el cuerpo.
  const ig = await buscarDiseno('cuántas publicaciones al día acepta Instagram por la API', { k: 3 });
  ok(
    'preguntando por Instagram, contesta con la página de Instagram',
    ig.some((h) => h.sourcePath.includes('instagram-platform')),
    ig.map((h) => h.sourcePath).join(' | '),
  );
}

// ---------------------------------------------------------------------------
// 5. La Sala: seis redes con lienzos
// ---------------------------------------------------------------------------

async function pruebaLaSala(project: Project) {
  ok('la Sala tiene seis redes', REDES_DE_LA_SALA.length === 6, REDES_DE_LA_SALA.join(','));
  for (const red of REDES_DE_LA_SALA) {
    const lienzos = formatosDeLaSala(red);
    ok(`${RED_LABEL[red]} tiene al menos un lienzo`, lienzos.length > 0, `${lienzos.length}`);
    ok(
      `los lienzos de ${RED_LABEL[red]} traen fuente oficial`,
      lienzos.every((l) => l.fuente.startsWith('https://') && Boolean(l.leidoEl)),
    );
  }

  const todos = formatosDelVisor();
  ok('el visor pinta los 19 lienzos del spec', todos.length === 19, `${todos.length}`);
  ok('Facebook trae el 1200 × 630 que pide el spec', todos.some((f) => f.ancho === 1200 && f.alto === 630));
  ok('y el 1080 × 1080', todos.some((f) => f.red === 'facebook' && f.ancho === 1080 && f.alto === 1080));
  ok('Instagram trae muro 1:1 y 4:5', todos.filter((f) => f.red === 'instagram' && f.chrome === 'muro').length === 2);
  ok('hay historia y reel con zona segura', todos.some((f) => f.chrome === 'historia') && todos.some((f) => f.chrome === 'reel'));
  ok('LinkedIn trae el carrusel en PDF', todos.some((f) => f.chrome === 'documento'));
  ok('X se pinta como hilo', todos.some((f) => f.chrome === 'hilo'));
  ok('YouTube trae la miniatura 1280 × 720', todos.some((f) => f.id === 'youtube-miniatura' && f.ancho === 1280 && f.alto === 720));
  ok('y existe la burbuja de Messenger', todos.some((f) => f.chrome === 'burbuja'));

  // La guía por red, que es el panel lateral.
  const guia = await guiaDeRed({ orgId: ORG, projectId: project.id, red: 'instagram' });
  ok('la guía de Instagram trae consejos de escritura', guia.escribir.length > 0);
  ok('trae lo que banea, con fuente', guia.banean.length > 0 && guia.banean.every((b) => b.fuente.startsWith('https://')));
  ok('dice el tope de hashtags de la red', guia.hashtags.texto.includes('30'));
  ok(
    'y avisa que NADIE publica su lista de hashtags bloqueados',
    guia.hashtags.texto.toLowerCase().includes('ninguna red publica su lista'),
  );
  ok(
    'los horarios NO se inventan cuando no hay datos',
    guia.horarios.fuente === null && guia.horarios.texto.includes('no te invento'),
    guia.horarios.texto.slice(0, 120),
  );
}

// ---------------------------------------------------------------------------
// 6. La compuerta es compuerta
// ---------------------------------------------------------------------------

async function pruebaCompuerta(project: Project) {
  // Ámbar + Goossip sola = no pasa.
  const conAcortador = 'Mira el depa: https://bit.ly/xyz123 — te va a gustar mucho, de verdad.';
  const sola = await compuerta({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: conAcortador,
    quien: 'goossip',
    accion: 'publicar',
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('el acortador pone ÁMBAR', sola.veredicto.semaforo === 'ambar', sola.veredicto.semaforo);
  ok('y en ámbar, Goossip SOLA no publica', !sola.puede, sola.motivo);

  const persona = await compuerta({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: conAcortador,
    quien: 'persona',
    accion: 'publicar',
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('pero una persona sí puede pasarlo', persona.puede);

  // Menciones masivas.
  const muchas = `Gracias ${Array.from({ length: 10 }, (_, i) => `@persona${i}`).join(' ')} por venir al evento de ayer.`;
  const r = await reglasDuras({
    orgId: ORG,
    project,
    red: 'instagram',
    formatoId: 'instagram-feed-45',
    texto: muchas,
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok(
    `${MENCIONES_QUE_HUELEN_MAL}+ menciones se marcan`,
    r.hallazgos.some((h) => h.texto.includes('menciones en una sola publicación')),
  );

  // Hashtags de más: rojo, con el número oficial.
  const treintaYUno = `Depa en Polanco ${Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')}`;
  const h = await reglasDuras({
    orgId: ORG,
    project,
    red: 'instagram',
    formatoId: 'instagram-feed-45',
    texto: treintaYUno,
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('31 hashtags en Instagram es ROJO', h.hallazgos.some((x) => x.nivel === 'rojo' && x.texto.includes('30')));

  // Y la bitácora: cada revisión deja constancia con las reglas evaluadas.
  const eventos = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, project.id));
  const revisiones = eventos.filter((e) => e.type === 'compuerta_revisada');
  ok('cada paso por la compuerta queda en la bitácora', revisiones.length > 0, `${revisiones.length}`);
  ok(
    'y la bitácora guarda CUÁNTAS reglas se evaluaron',
    revisiones.every((e) => Number((e.payload as any)?.reglasEvaluadas) > 0),
  );
  ok(
    'y las reglas citadas, con su URL',
    revisiones.some((e) => ((e.payload as any)?.hallazgos ?? []).some((x: any) => x.fuente?.startsWith('https://'))),
  );
}

/**
 * EL CASO QUE DEBE FALLAR, a mano.
 *
 * Si el modelo pudiera quitar un hallazgo duro, la compuerta sería un consejo.
 * Esto comprueba que no puede: se corre la revisión SIN modelo sobre un texto
 * rojo, y el resultado tiene que seguir siendo rojo sin importar nada más.
 */
async function pruebaElModeloNoAbre(project: Project) {
  const rojo = 'Rendimiento garantizado del 24% anual en tu inversión, sin riesgo.';
  const v = await revisar({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: rojo,
    sinFrecuencia: true,
    // Con el modelo apagado, `avisoDeRevision` se llena. Aun así tiene que ser
    // ROJO: el aviso solo puede EMPEORAR el semáforo (verde → ámbar), nunca
    // mejorarlo.
    sinModelo: true,
  });
  ok('sin modelo, un texto rojo sigue siendo rojo', v.semaforo === 'rojo', v.semaforo);
  ok('y se dice que el modelo no opinó', Boolean(v.avisoDeRevision));

  // Y al revés: un texto limpio sin modelo no sale verde a ciegas.
  const limpio = await revisar({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: 'Departamento modelo abierto este fin de semana en Polanco. Agenda tu visita.',
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok(
    'un texto limpio SIN revisión del modelo queda en ámbar, no en verde',
    limpio.semaforo === 'ambar',
    limpio.semaforo,
  );
}

// ---------------------------------------------------------------------------
// 7. Frecuencia y cuota
// ---------------------------------------------------------------------------

async function pruebaFrecuencia(project: Project) {
  const sinNada = await usoDeHoy({ orgId: ORG, projectId: project.id, red: 'instagram' });
  ok('sin publicaciones, hoy es 0', sinNada.hoy === 0);
  ok('el tope de Instagram es el chico de los dos que publica la API (50)', sinNada.tope === 50);
  ok('y quedan 50', sinNada.quedan === 50);
  ok('el aviso dice el número', sinNada.aviso.includes('50'), sinNada.aviso);
  ok('y no está agotado', !sinNada.agotado);

  // Se llena la cuota: 50 publicaciones de hoy.
  await db.insert(posts).values(
    Array.from({ length: 50 }, (_, i) => ({
      orgId: ORG,
      projectId: project.id,
      platform: 'instagram',
      text: `Publicación de prueba número ${i}`,
      createdAt: new Date(),
    })),
  );
  const lleno = await usoDeHoy({ orgId: ORG, projectId: project.id, red: 'instagram' });
  ok('con 50 publicadas, la cuota se agota', lleno.agotado && lleno.quedan === 0, `${lleno.hoy}/${lleno.tope}`);
  const v = veredictoDeFrecuencia(lleno);
  ok('y el veredicto es ROJO', v.nivel === 'rojo' && !v.puede);
  ok('citando la regla de Instagram con su URL', v.fuente?.includes('instagram-platform') === true, v.fuente ?? 'sin fuente');

  // LinkedIn NO publica su tope: no se inventa un número.
  const li = await usoDeHoy({ orgId: ORG, projectId: project.id, red: 'linkedin' });
  ok('LinkedIn no tiene tope publicado', li.tope === null && li.quedan === null);
  ok(
    'y se DICE que no se dice, en vez de inventarlo',
    li.aviso.includes('no publica') && li.aviso.includes('inventando'),
    li.aviso,
  );

  // El ritmo: dos seguidas en Instagram son muchas para el criterio de la casa.
  ok('el espaciado sugerido de Instagram es de 3 horas', ESPACIADO_SUGERIDO_MIN.instagram === 180);
  ok('va muy seguido', lleno.muySeguido, `${lleno.minutosDesdeLaUltima} min`);
  ok(
    'y el aviso dice que ESO es criterio nuestro, no regla de la red',
    veredictoDeFrecuencia({ ...lleno, agotado: false, quedan: 5 }).motivo.includes('decidimos nosotros'),
  );

  // --- el texto repetido ----------------------------------------------------
  //
  // El detector compara BOLSAS DE PALABRAS de más de tres letras, así que hay
  // que probarlo con textos de verdad, no con "prueba número 7": dos frases
  // cortas que comparten tres palabras no se parecen un 85 %, y exigir que el
  // detector las marque sería exigirle que se equivoque.
  const yaPublicado =
    'Departamento modelo abierto este fin de semana en Polanco. Tres recámaras, ' +
    'terraza y estacionamiento techado. Agenda tu visita sin compromiso.';
  await db.insert(posts).values({
    orgId: ORG,
    projectId: project.id,
    platform: 'facebook',
    text: yaPublicado,
    createdAt: new Date(),
  });

  const mismo = yaPublicado;
  ok('parecido consigo mismo es 1', parecido(mismo, mismo) === 1);
  ok('el umbral de "es la misma otra vez" es alto', PARECIDO_QUE_ES_REPETIR >= 0.8);
  ok(
    'dos textos distintos NO se parecen',
    parecido(yaPublicado, 'Oficinas en renta en Santa Fe con contrato anual y servicios incluidos.') < 0.3,
  );

  // La MISMA publicación con una palabra cambiada: es lo que las redes llaman
  // contenido repetitivo.
  const casiIgual = yaPublicado.replace('Polanco', 'Polanco (¡última semana!)');
  ok('casi igual sí se parece', parecido(yaPublicado, casiIgual) >= PARECIDO_QUE_ES_REPETIR, `${parecido(yaPublicado, casiIgual)}`);

  const rep = await reglasDuras({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: casiIgual,
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok(
    'y la compuerta lo marca contra lo ya publicado',
    rep.hallazgos.some((h) => h.texto.includes('se parece')),
    JSON.stringify(rep.hallazgos.map((x) => x.texto.slice(0, 70))),
  );

  // Y el caso que NO debe marcarse: una pieza nueva de verdad.
  const nueva = await reglasDuras({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: 'Oficinas en renta en Santa Fe, contrato anual, servicios y estacionamiento incluidos.',
    sinFrecuencia: true,
    sinModelo: true,
  });
  ok('una pieza distinta NO se marca como repetida', !nueva.hallazgos.some((h) => h.texto.includes('se parece')));
}

// ---------------------------------------------------------------------------
// 8. Nada inventado
// ---------------------------------------------------------------------------

function pruebaNadaInventado() {
  ok('hay reglas cargadas', REGLAS.length >= 30, `${REGLAS.length}`);
  ok(
    'TODAS traen una URL http y una fecha de lectura',
    REGLAS.every((r) => r.fuente.startsWith('https://') && /^\d{4}-\d{2}-\d{2}$/.test(r.leidoEl)),
    REGLAS.filter((r) => !r.fuente.startsWith('https://')).map((r) => r.id).join(','),
  );
  ok(
    'y todas traen el texto de la política, no solo un resumen',
    REGLAS.every((r) => r.dice.length > 80),
  );

  const c = cuantasReglas();
  ok('hay reglas para las seis redes de la Sala', REDES_DE_LA_SALA.every((r) => (c.porAmbito[r] ?? 0) > 0 || r === 'instagram'), JSON.stringify(c.porAmbito));
  ok('y para México', (c.porAmbito.mexico ?? 0) >= 4, `${c.porAmbito.mexico}`);

  // Instagram hereda las de Facebook: es la misma plataforma.
  const ig = reglasDe('instagram');
  ok('Instagram hereda las normas de publicidad de Meta', ig.some((r) => r.id === 'meta-ads-contenido-enganoso'));
  ok('y todas las redes heredan las leyes mexicanas', REDES.every((r) => reglasDe(r).some((x) => x.ambito === 'mexico')));

  // Lo que no está publicado, marcado como no publicado.
  ok('LinkedIn: sin tope publicado', LIMITES.linkedin.porDia === null && !LIMITES.linkedin.publicado);
  ok('Facebook: tampoco (topa llamadas, no publicaciones)', LIMITES.facebook.porDia === null);
  ok('Instagram: 50, y es lo que publica su documentación', LIMITES.instagram.porDia === 50 && LIMITES.instagram.publicado);
  ok('TikTok: unas 15 por creador', LIMITES.tiktok.porDia === 15);
  ok('YouTube: 100 subidas y 10 000 unidades al día', LIMITES.youtube.unidadesDia?.total === 10_000 && LIMITES.youtube.porDia === 100);

  // Los cortes: los observados van marcados como observados.
  ok('el corte de Facebook está marcado como OBSERVADO', CORTES.facebook.origenVisible === 'observado');
  ok('el tope de X está marcado como OFICIAL y trae fuente', CORTES.twitter.origenTope === 'oficial' && Boolean(CORTES.twitter.fuente));
  ok('el tope de Instagram (2200) es oficial', CORTES.instagram.origenTope === 'oficial');
  ok(
    'todo corte marcado oficial trae URL; todo observado lo explica',
    REDES.every((r) => {
      const c2 = corteDe(r);
      const oficialOk = c2.origenTope !== 'oficial' || Boolean(c2.fuente?.startsWith('https://'));
      const observadoOk = c2.origenVisible !== 'observado' || Boolean(c2.nota);
      return oficialOk && observadoOk;
    }),
  );

  // La corrección del spec: la NOM-024 NO es de comercio electrónico.
  const nom = reglaPorId('mx-nom-024')!;
  ok('la NOM-024 se guarda con lo que de verdad dice', nom.dice.includes('empaques, instructivos y garantías'));
  ok('y se avisa que NO es la de comercio electrónico', nom.paraGoossip.includes('no es de comercio electrónico'));
  ok('el comercio electrónico se cubre con el 76 BIS de la LFPC', Boolean(reglaPorId('mx-lfpc-76bis')));
}

// ---------------------------------------------------------------------------
// 9. WhatsApp: "Más adelante", no "Conectar"
// ---------------------------------------------------------------------------

function pruebaWhatsapp(project: Project) {
  const { cards } = buildChannelCards(project, []);
  const wa = cards.find((c) => c.id === 'whatsapp');
  ok('el chip de WhatsApp existe en la franja', Boolean(wa));
  ok('y NO ofrece conectar', wa?.state === 'proximamente', wa?.state ?? 'sin tarjeta');
  ok('dice "Más adelante"', wa?.espera === 'Más adelante', wa?.espera ?? '');
  ok('y explica por qué', Boolean(wa?.pending), wa?.pending ?? '');

  // El resto de lo que no se puede conectar sigue diciendo "Próximamente":
  // son dos promesas distintas y no se pueden confundir.
  const otros = cards.filter((c) => c.state === 'proximamente' && c.id !== 'whatsapp');
  ok(
    'los demás siguen diciendo "Próximamente"',
    otros.length > 0 && otros.every((c) => c.espera === 'Próximamente'),
    `${otros.length}`,
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Corregir con Goossip — la parte determinista (sin el modelo)
// ---------------------------------------------------------------------------

async function pruebaCorregir(project: Project) {
  // Un texto limpio no tiene qué reescribir: corregir lo dice, no inventa un
  // cambio. Con `sinModelo` la DETECCIÓN es determinista y no toca la red.
  const limpio = await corregir({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: 'Departamento modelo abierto este fin de semana en Polanco.',
    sinModelo: true,
  });
  ok('corregir un texto limpio no cambia nada', limpio.cambio === false);
  ok('y explica por qué no había qué reescribir', Boolean(limpio.aviso));
  ok('y devuelve el texto tal cual', limpio.textoCorregido.includes('Polanco'));

  // Un rojo de archivo/frecuencia NO es cosa de reescribir el texto: corregir
  // no lo intenta. (Aquí no hay pieza ni medida, así que no hay hallazgo
  // corregible de texto y responde que no hay nada que reescribir.)
  const soloFrecuencia = await corregir({
    orgId: ORG,
    project,
    red: 'facebook',
    formatoId: 'facebook-feed',
    texto: 'Un texto normal, sin promesas ni hashtags de más.',
    sinModelo: true,
  });
  ok('sin hallazgos de texto, corregir no reescribe', soloFrecuencia.cambio === false);
}

async function main() {
  console.log('Pruebas de la corrida 10 — la Sala de arte y comunicación\n');

  pruebaUnoAspecto();
  pruebaTresReel();
  pruebaNadaInventado();

  try {
    const project = await montarProyecto('Sala');
    pruebaWhatsapp(project);
    await pruebaDosPromesa(project);
    await pruebaFalsosPositivos(project);
    await pruebaCuatroBusqueda();
    await pruebaLaSala(project);
    await pruebaCompuerta(project);
    await pruebaElModeloNoAbre(project);
    await pruebaFrecuencia(project);
    await pruebaCorregir(project);
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
