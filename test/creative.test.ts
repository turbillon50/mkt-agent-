/**
 * Pruebas de la corrida 6 — piezas, memoria de diseño y Asistente por proyecto.
 *
 *   npx tsx test/creative.test.ts
 *
 * Qué se prueba y por qué cada una está aquí:
 *
 *  1. LAS MEDIDAS. Cada formato del catálogo tiene fuente con URL y fecha, y
 *     elegir lienzo por una pista en español ("reel", "historia") devuelve el
 *     lienzo correcto. Si alguien mete un formato sin citar de dónde salió, la
 *     prueba lo caza — que es la mitad del encargo del issue.
 *  2. LA MEMORIA DE DISEÑO. Que esté ingerida, que la ingesta sea idempotente
 *     (la prueba 4 del issue: re-correr = 0 nuevos) y que buscar "¿qué medidas
 *     lleva un reel?" devuelva la spec Y su fuente.
 *  3. EL KIT DE MARCA. Limpiar lo que llega de fuera sin tirar la paleta
 *     entera por un hex torcido, y que un color no se pierda su rol.
 *  4. EL COMPOSITOR. Que la pieza salga EXACTAMENTE del tamaño que pide la red
 *     —no del que quiso el modelo— y que respete el tope de peso.
 *  5. EL AISLAMIENTO DEL ASISTENTE. Que las tools vengan atadas al proyecto y
 *     que un `lector` no pueda publicar aunque el modelo se lo pida.
 *  6. LA GUÍA ACTIVA. Que un proyecto recién nacido produzca las sugerencias
 *     que le tocan, con acción, y que un proyecto al día no invente alarmas.
 *  7. UN CASO QUE DEBE FALLAR, a mano: una palabra prohibida del kit tiene que
 *     detener la pieza antes de gastar un solo modelo.
 *
 * Todo lo que crea en la base se borra al final, pase o falle.
 */
import '../src/env';
import sharp from 'sharp';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  campaigns,
  creativePieces,
  organizations,
  projectBrandKit,
  users,
  type Project,
} from '../src/db/schema';
import {
  FORMATOS,
  REDES,
  elegirFormato,
  formatoPorId,
  formatosDe,
  redesConFuente,
  specEnPalabras,
  zonaSeguraPx,
} from '../src/creative/specs';
import {
  fotoDelKit,
  kitCompleto,
  kitComoPrompt,
  limpiarPaleta,
  limpiarPalabras,
  limpiarTipografias,
  palabrasProhibidasEn,
  saveBrandKit,
  getBrandKit,
} from '../src/creative/brand-kit';
import { alFormatoDeLaRed, componer, partirEnRenglones } from '../src/creative/compose';
import { partirMarkdown, buscarDiseno, contarDiseno, hashOf } from '../src/design/knowledge';
import { pendientesDelProyecto } from '../src/assistant/guia';
import { avisoDeImagen, detectarPedidoDeImagen } from '../src/assistant/intencion';
import { toolsParaProyecto } from '../src/agent/project-tools';
import { fichaDelProyecto, identidadDeCanal } from '../src/agent/project-context';
import { ratioParaGemini } from '../src/creative/gemini';
import { higgsfieldListo, creditos } from '../src/creative/higgsfield';

let pasadas = 0;
const fallidas: string[] = [];

function ok(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) {
    pasadas += 1;
  } else {
    fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

const SUFIJO = `c6-${Date.now()}`;
const ORG = `org_${SUFIJO}`;
const creados = { proyectos: [] as string[], usuarios: [] as string[] };

async function montarProyecto(nombre: string): Promise<Project> {
  await db
    .insert(organizations)
    .values({ id: ORG, name: `Prueba ${SUFIJO}` })
    .onConflictDoNothing();

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
      brandVoice: 'directo y cálido',
      kind: 'servicios',
    })
    .returning();
  creados.proyectos.push(p!.id);
  return p!;
}

async function limpiar() {
  if (creados.proyectos.length) {
    await db.delete(creativePieces).where(inArray(creativePieces.projectId, creados.proyectos));
    await db.delete(projectBrandKit).where(inArray(projectBrandKit.projectId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
  }
  if (creados.usuarios.length) {
    await db.delete(users).where(inArray(users.id, creados.usuarios));
  }
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

// ---------------------------------------------------------------------------
// 1. Las medidas
// ---------------------------------------------------------------------------

function pruebaSpecs() {
  ok('hay formatos', FORMATOS.length >= 20, `${FORMATOS.length}`);

  for (const f of FORMATOS) {
    ok(
      `${f.id} cita fuente`,
      f.fuente.startsWith('https://'),
      `fuente="${f.fuente}"`,
    );
    ok(`${f.id} trae fecha`, /^\d{4}-\d{2}-\d{2}$/.test(f.leidoEl), f.leidoEl);
    ok(`${f.id} tiene lienzo`, f.ancho > 0 && f.alto > 0, `${f.ancho}x${f.alto}`);
    ok(`${f.id} declara archivos`, f.archivos.length > 0);
  }

  ok(
    'las 8 redes del issue traen fuente',
    redesConFuente().length === REDES.length,
    `${redesConFuente().length}/${REDES.length}`,
  );

  // Elegir el lienzo por una pista en español.
  ok('reel → 9:16', elegirFormato('instagram', 'reel').ratio === '9:16');
  ok('historia → 9:16', elegirFormato('instagram', 'historia').ratio === '9:16');
  ok('cuadrado → 1:1', elegirFormato('instagram', 'cuadrado').ratio === '1:1');
  ok('carrusel → carrusel', elegirFormato('linkedin', 'carrusel').id.includes('carrusel'));
  ok('pdf → documento', elegirFormato('linkedin', 'pdf').tipo === 'documento');
  ok('miniatura → 16:9', elegirFormato('youtube', 'miniatura').ratio === '16:9');
  ok('sin pista → el de omisión', elegirFormato('instagram').id === 'instagram-feed-45');
  ok(
    'una pista que no existe no rompe',
    elegirFormato('facebook', 'algo-que-nadie-dijo-nunca').id === 'facebook-feed',
  );

  // La spec dicha en palabras SIEMPRE lleva su fuente pegada: es lo que el
  // Asistente le va a leer al usuario, y una medida sin procedencia es una
  // medida que nadie puede verificar.
  const reel = formatoPorId('instagram-reel')!;
  const texto = specEnPalabras(reel);
  ok('la spec dicha cita su fuente', texto.includes(reel.fuente));
  ok('la spec dicha trae la fecha', texto.includes(reel.leidoEl));
  ok('la spec dicha trae los píxeles', texto.includes('1080') && texto.includes('1920'));

  const z = zonaSeguraPx(reel);
  ok('zona segura en píxeles', z.arriba > 0 && z.abajo > 0 && z.lados > 0, JSON.stringify(z));
  ok('la zona segura cabe en el lienzo', z.arriba + z.abajo < reel.alto);

  // Gemini solo admite ciertas proporciones. La de la spec tiene que mapear a
  // una de ellas SIEMPRE, o la llamada revienta con un 400.
  const admitidas = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  for (const f of FORMATOS) {
    ok(`${f.id} mapea a una proporción de Gemini`, admitidas.includes(ratioParaGemini(f)));
  }

  ok('cada red tiene al menos un formato', REDES.every((r) => formatosDe(r).length > 0));
}

// ---------------------------------------------------------------------------
// 2. La memoria de diseño
// ---------------------------------------------------------------------------

async function pruebaMemoriaDeDiseno() {
  // Partir markdown: ni pedazos huérfanos ni un archivo entero de un bocado.
  const md = `# Título\n\nUn párrafo de arranque con suficiente texto como para que valga la pena guardarlo y no se pegue al anterior por ser demasiado corto.\n\n## Sección\n\n${'Texto largo. '.repeat(200)}\n\n## Otra\n\nCorto.`;
  const pedazos = partirMarkdown(md);
  ok('partir markdown da pedazos', pedazos.length >= 2, `${pedazos.length}`);
  ok('ningún pedazo vacío', pedazos.every((p) => p.content.trim().length > 0));
  ok(
    'ningún pedazo descomunal',
    pedazos.every((p) => p.content.length < 4000),
    `máx ${Math.max(...pedazos.map((p) => p.content.length))}`,
  );
  ok('el hash es estable', hashOf('abc') === hashOf('abc'));
  ok('el hash distingue', hashOf('abc') !== hashOf('abd'));

  const total = await contarDiseno().catch(() => null);
  if (!total) {
    fallidas.push('no se pudo contar la memoria de diseño');
    return;
  }
  ok('hay memoria de diseño ingerida', total.chunks > 500, `${total.chunks} pedazos`);
  ok('hay specs por red ingeridas', (total.porCategoria['spec-red'] ?? 0) >= 20);
  ok('hay skills de Higgsfield ingeridas', (total.porCategoria.higgsfield ?? 0) > 100);

  // La prueba 3 del issue: preguntarle las medidas de un reel y que conteste
  // con la spec ingerida Y su fuente.
  const hits = await buscarDiseno('¿qué medidas lleva un reel de Instagram?', { k: 3 });
  ok('buscar en diseño devuelve algo', hits.length > 0);
  const reel = hits.find((h) => h.content.includes('1080 × 1920'));
  ok('la primera respuesta es la spec del reel', Boolean(reel), hits[0]?.title ?? 'sin título');
  ok(
    'la respuesta trae su fuente oficial',
    Boolean(reel?.content.includes('developers.facebook.com')),
  );
  ok(
    'la fuente también está en el source_path',
    Boolean(reel?.sourcePath.startsWith('https://')),
    reel?.sourcePath,
  );

  const higgs = await buscarDiseno('cómo hago una foto de producto', {
    k: 2,
    category: 'higgsfield',
  });
  ok('el filtro por categoría funciona', higgs.every((h) => h.category === 'higgsfield'));
}

// ---------------------------------------------------------------------------
// 3. El kit de marca
// ---------------------------------------------------------------------------

async function pruebaKit(project: Project) {
  // Limpiar lo que llega de fuera: un hex torcido no puede tirar la paleta.
  const sucia = limpiarPaleta([
    { rol: 'primario', hex: '#0b5fff', nombre: 'Azul' },
    { rol: 'fondo', hex: 'no-es-un-color' },
    { rol: 'inventado', hex: '#FFFFFF' },
    { rol: 'texto', hex: '#111111' },
    { rol: 'primario', hex: '#0B5FFF' },
  ]);
  ok('el hex malo se cae solo', !sucia.some((c) => c.hex === 'no-es-un-color'));
  ok('los buenos sobreviven', sucia.length === 3, `${sucia.length}: ${JSON.stringify(sucia)}`);
  ok('el hex se normaliza a mayúsculas', sucia[0]!.hex === '#0B5FFF');
  ok('un rol inventado cae en acento', sucia.some((c) => c.rol === 'acento'));
  ok('no se duplica el mismo color con el mismo rol', sucia.filter((c) => c.rol === 'primario').length === 1);

  ok('tipografía sin familia se descarta', limpiarTipografias([{ rol: 'titulos' }]).length === 0);
  ok(
    'las palabras prohibidas se parten por coma',
    limpiarPalabras('barato, oferta,  urgente , barato').length === 3,
  );

  const kit = await saveBrandKit(
    ORG,
    project.id,
    {
      logoUrl: null,
      paleta: [
        { rol: 'primario', hex: '#0B5FFF' },
        { rol: 'fondo', hex: '#0B1220' },
        { rol: 'texto', hex: '#FFFFFF' },
      ],
      tipografias: [{ rol: 'titulos', familia: 'Inter', peso: '700' }],
      tono: 'Directo y cálido. Tuteamos.',
      palabrasProhibidas: ['barato', 'gratis total'],
    },
    'prueba@goossip.mx',
  );
  ok('el kit se guarda', kit.paleta.length === 3);

  // Guardar dos veces es actualizar, no duplicar: la tabla tiene una fila por
  // proyecto y la llave primaria es el proyecto.
  //
  // Y lo que NO viene en la llamada no se toca. Este guardado solo trae el
  // tono: las palabras prohibidas y la paleta tienen que seguir ahí. Antes no
  // seguían — una llamada parcial le borraba al cliente media marca sin decir
  // nada, y esta prueba existe por eso.
  await saveBrandKit(ORG, project.id, { tono: 'Otro tono' }, 'prueba@goossip.mx');
  const releido = await getBrandKit(ORG, project.id);
  ok('guardar dos veces actualiza', releido?.tono === 'Otro tono');
  ok('un guardado parcial no borra la paleta', (releido?.paleta.length ?? 0) === 3);
  ok(
    'un guardado parcial no borra las palabras prohibidas',
    (releido?.palabrasProhibidas.length ?? 0) === 2,
  );
  ok(
    'pero un null explícito sí borra',
    (await saveBrandKit(ORG, project.id, { logoUrl: null }, 'prueba@goossip.mx')).logoUrl === null,
  );

  ok('el kit se considera completo', kitCompleto(releido));
  ok('sin kit no está completo', !kitCompleto(null));

  const prompt = kitComoPrompt(releido, project);
  ok('el prompt lleva el color principal', prompt.includes('#0B5FFF'));
  ok('el prompt lleva las palabras prohibidas', prompt.includes('barato'));
  ok('el prompt nombra al proyecto', prompt.includes(project.name));
  ok(
    'sin kit el prompt lo dice en vez de inventar colores',
    kitComoPrompt(null, project).includes('no tiene kit'),
  );

  // La prueba que DEBE frenar: una palabra prohibida detiene la pieza antes de
  // gastar un modelo.
  ok(
    'una palabra prohibida se detecta',
    palabrasProhibidasEn(releido, 'Lo más BARATO del mercado').length === 1,
  );
  ok('sin palabra prohibida no hay falso positivo', palabrasProhibidasEn(releido, 'Calidad').length === 0);

  const foto = fotoDelKit(releido);
  ok('la foto del kit guarda la paleta', Array.isArray((foto as any).paleta));

  return releido;
}

// ---------------------------------------------------------------------------
// 4. El compositor
// ---------------------------------------------------------------------------

async function pruebaCompositor(project: Project, kit: Awaited<ReturnType<typeof getBrandKit>>) {
  ok('el titular se parte en renglones', partirEnRenglones('a '.repeat(60), 900, 80).length > 1);
  ok('un titular corto no se parte', partirEnRenglones('Hola', 900, 80).length === 1);
  ok('nunca más de 4 renglones', partirEnRenglones('palabra '.repeat(200), 400, 80).length <= 4);

  // Una base "fea" a propósito: cuadrada, cuando la red quiere 4:5. El
  // compositor tiene que devolverla EXACTA a la spec — eso es lo que Gemini no
  // garantiza (pidiéndole 4:5 devolvió 896×1152).
  const base = await sharp({
    create: { width: 700, height: 700, channels: 3, background: '#1b2430' },
  })
    .png()
    .toBuffer();

  const formato = formatoPorId('instagram-feed-45')!;
  const r = await componer({
    baseBuf: base,
    formato,
    kit,
    textos: { titular: 'Departamento modelo abierto este fin de semana', cta: 'Agenda tu visita' },
  });

  ok('la pieza sale del ancho de la spec', r.ancho === formato.ancho, `${r.ancho}`);
  ok('la pieza sale del alto de la spec', r.alto === formato.alto, `${r.alto}`);

  const meta = await sharp(r.buf).metadata();
  ok('los píxeles reales coinciden', meta.width === formato.ancho && meta.height === formato.alto,
    `${meta.width}x${meta.height}`);
  ok('puso el titular', r.puso.titular);
  ok('puso el CTA', r.puso.cta);

  // Instagram por la API solo come JPEG, y por debajo de su tope de peso.
  const final = await alFormatoDeLaRed(r.buf, formato);
  ok('Instagram se lleva un JPEG', final.ext === 'jpg', final.ext);
  ok(
    'y por debajo del tope de peso',
    final.buf.byteLength <= (formato.pesoMaxMb ?? 8) * 1024 * 1024,
    `${Math.round(final.buf.byteLength / 1024)} KB`,
  );
  const metaFinal = await sharp(final.buf).metadata();
  ok('el JPEG conserva el lienzo', metaFinal.width === formato.ancho);

  // Un formato que admite PNG no se convierte a la fuerza.
  const fb = formatoPorId('facebook-feed')!;
  const png = await alFormatoDeLaRed(r.buf, fb);
  ok('donde cabe PNG se queda PNG', png.ext === 'png');

  // Texto con XML dentro: un "&" del cliente no puede romper la pieza.
  const conAmp = await componer({
    baseBuf: base,
    formato,
    kit,
    textos: { titular: 'Casa & Jardín <ahora>', cta: '"Ven"' },
  });
  ok('un & en el copy no rompe la pieza', conAmp.buf.byteLength > 0);

  void project;
}

// ---------------------------------------------------------------------------
// 5. El Asistente está atado al proyecto
// ---------------------------------------------------------------------------

async function pruebaAsistente(project: Project, kit: Awaited<ReturnType<typeof getBrandKit>>) {
  const ctxOperador = {
    project,
    orgId: ORG,
    quien: 'prueba@goossip.mx',
    puedeOperar: true,
    kit,
  };
  const ctxLector = { ...ctxOperador, puedeOperar: false };

  const tools = toolsParaProyecto(ctxOperador);
  ok('el Asistente trae sus herramientas', Object.keys(tools).length >= 10, `${Object.keys(tools).length}`);

  // Lo que más importa: NINGUNA tool pide `projectId`. El proyecto viene
  // cerrado; el modelo no lo puede cambiar por el del cliente de al lado.
  const pideProyecto = Object.entries(tools).filter(([, t]) => {
    const forma = (t as any).inputSchema?.shape ?? {};
    return 'projectId' in forma || 'proyectoId' in forma;
  });
  ok(
    'ninguna herramienta deja que el modelo elija el proyecto',
    pideProyecto.length === 0,
    pideProyecto.map(([k]) => k).join(', '),
  );

  ok(
    'la identidad de canal es la del proyecto',
    identidadDeCanal(ctxOperador) === `project:${project.id}`,
    identidadDeCanal(ctxOperador),
  );

  const ficha = fichaDelProyecto(ctxOperador);
  ok('la ficha nombra al proyecto', ficha.includes(project.name));
  ok('la ficha lleva los colores del kit', ficha.includes('#0B5FFF'));
  ok('la ficha lleva las palabras prohibidas', ficha.includes('barato'));
  ok(
    'a un lector se le dice que no toque nada',
    fichaDelProyecto(ctxLector).includes('solo puede MIRAR'),
  );

  // Las medidas, por la herramienta, con fuente. Prueba 3 del issue por el
  // camino que de verdad usa el Asistente.
  const medidas: any = await (tools.medidasDeRed as any).execute({ red: 'instagram', formato: 'reel' });
  ok('la herramienta contesta las medidas', medidas.respuesta.includes('1080 × 1920'));
  ok('y devuelve la fuente', medidas.fuente.startsWith('https://'));
  ok('y la fecha en que se leyó', /^\d{4}-\d{2}-\d{2}$/.test(medidas.leidoEl));
  ok('y ofrece los otros formatos', Array.isArray(medidas.otrosFormatos) && medidas.otrosFormatos.length > 0);

  // Un LECTOR no publica ni hace piezas, aunque el modelo lo pida.
  const toolsLector = toolsParaProyecto(ctxLector);
  let frenado = false;
  try {
    await (toolsLector.hacerPieza as any).execute({ red: 'instagram', brief: 'lo que sea' });
  } catch (e) {
    frenado = e instanceof Error && e.message.includes('no tiene permiso');
  }
  ok('un lector no puede hacer piezas', frenado);

  frenado = false;
  try {
    await (toolsLector.publicarPost as any).execute({ red: 'linkedin', texto: 'hola' });
  } catch (e) {
    frenado = e instanceof Error && e.message.includes('no tiene permiso');
  }
  ok('un lector no puede publicar', frenado);

  // Publicar en una red que ESTE proyecto no tiene conectada: se dice, no se
  // intenta por otro lado. Es la prueba 1 del issue, su segunda mitad.
  let motivo = '';
  try {
    await (tools.publicarPost as any).execute({ red: 'linkedin', texto: 'hola' });
  } catch (e) {
    motivo = e instanceof Error ? e.message : '';
  }
  ok(
    'sin la red conectada se dice qué falta, con el nombre del proyecto',
    motivo.includes(project.name) && motivo.includes('Conexiones'),
    motivo,
  );

  // La palabra prohibida frena la pieza ANTES de gastar un modelo.
  motivo = '';
  try {
    await (tools.hacerPieza as any).execute({
      red: 'instagram',
      brief: 'lo más barato de la zona',
    });
  } catch (e) {
    motivo = e instanceof Error ? e.message : '';
  }
  ok('una palabra prohibida detiene la pieza', motivo.includes('barato'), motivo);

  // Y el texto de un post SIEMPRE ofrece la imagen.
  const draft: any = await (tools.generarTextoDePost as any)
    .execute({ red: 'instagram', tema: 'departamento modelo en Polanco' })
    .catch(() => null);
  if (draft) {
    ok('el post ofrece la imagen', String(draft.ofreceImagen).includes('imagen'));
    ok('y dice las medidas', String(draft.medidas).includes('px'));
  } else {
    // El generador necesita el Mesh vivo; si no contesta, no se inventa que sí.
    fallidas.push('generarTextoDePost no contestó (¿Mesh caído?)');
  }
}

// ---------------------------------------------------------------------------
// 5b. "Hazme una imagen de…" en lenguaje normal
// ---------------------------------------------------------------------------

/**
 * Viene de un arreglo que Luis metió a `main` sobre el chat global. Esta
 * corrida se lleva ese chat, así que el comportamiento se trae aquí — y con
 * prueba, que allá no tenía.
 */
function pruebaPedidoDeImagen() {
  const si = [
    'hazme una imagen del departamento modelo',
    'Hazme una pieza para Instagram del open house',
    '¿puedes crear un banner para la campaña?',
    'necesito una foto de producto',
    'genérame una miniatura para el video',
    '/imagen atardecer en Polanco',
    'diséñame un flyer del evento',
  ];
  for (const t of si) {
    const p = detectarPedidoDeImagen(t);
    ok(`"${t.slice(0, 32)}…" es un pedido de imagen`, p !== null);
    if (p) ok(`  y trae descripción`, p.brief.length >= 3, p.brief);
  }

  const no = [
    'hola, ¿cómo vamos?',
    '¿qué medidas lleva un reel?',
    'publica en LinkedIn: hoy abrimos el departamento modelo',
    'cuántos leads tengo sin contactar',
  ];
  for (const t of no) {
    ok(`"${t.slice(0, 32)}…" NO es un pedido de imagen`, detectarPedidoDeImagen(t) === null);
  }

  // La red y el formato, cuando el usuario los dice, se le hacen caso.
  const conRed = detectarPedidoDeImagen('hazme una historia para instagram del open house');
  ok('saca la red que dijo el usuario', conRed?.red === 'instagram', String(conRed?.red));
  ok('y la pista de formato', conRed?.formato === 'historia', String(conRed?.formato));

  const li = detectarPedidoDeImagen('créame una imagen cuadrada para LinkedIn');
  ok('reconoce LinkedIn', li?.red === 'linkedin', String(li?.red));
  ok('y "cuadrada"', li?.formato === 'cuadrado', String(li?.formato));

  // El verbo de arranque se quita, la descripción se respeta.
  const limpio = detectarPedidoDeImagen('hazme una imagen de un atardecer en Polanco');
  ok(
    'quita el verbo y deja lo que describió el usuario',
    limpio?.brief === 'una imagen de un atardecer en Polanco',
    String(limpio?.brief),
  );

  // Y el comando de siempre sigue sirviendo, marcado como explícito.
  const cmd = detectarPedidoDeImagen('/imagen un gato en la azotea');
  ok('el comando /imagen sigue vivo', cmd?.explicito === true);
  ok('y su brief es lo que iba después', cmd?.brief === 'un gato en la azotea', String(cmd?.brief));

  // Que el aviso al modelo nombre la herramienta correcta.
  ok('el aviso nombra hacer-pieza', avisoDeImagen(limpio!).includes('hacer-pieza'));
}

// ---------------------------------------------------------------------------
// 6. La guía activa
// ---------------------------------------------------------------------------

async function pruebaGuia(nuevo: Project, conKit: Project, kit: Awaited<ReturnType<typeof getBrandKit>>) {
  const gNuevo = await pendientesDelProyecto({ orgId: ORG, project: nuevo, kit: null });
  ok('un proyecto nuevo tiene pendientes', gNuevo.sugerencias.length >= 2);
  ok('le dice que no tiene canales', gNuevo.sugerencias.some((s) => s.id === 'sin-canales'));
  ok('le dice que no tiene marca', gNuevo.sugerencias.some((s) => s.id === 'sin-kit'));
  ok(
    'cada sugerencia trae acción',
    gNuevo.sugerencias.every((s) => Boolean(s.accion.href || s.accion.prompt)),
  );
  ok(
    'cada sugerencia dice la consecuencia, no solo el síntoma',
    gNuevo.sugerencias.every((s) => s.texto.length > 40),
  );
  ok(
    'lo urgente va primero',
    gNuevo.sugerencias[0]!.urgencia === 'alta',
    gNuevo.sugerencias[0]!.urgencia,
  );
  ok('no inventa leads', gNuevo.leadsSinContactar === 0);

  const gKit = await pendientesDelProyecto({ orgId: ORG, project: conKit, kit });
  ok('con marca cargada deja de pedirla', !gKit.sugerencias.some((s) => s.id === 'sin-kit'));
  ok('la guía sabe que la marca está', gKit.kitCompleto);
}

// ---------------------------------------------------------------------------
// 7. Higgsfield: solo se reporta lo que se midió
// ---------------------------------------------------------------------------

async function pruebaHiggsfield() {
  if (!higgsfieldListo()) {
    console.log('  (Higgsfield sin token en este entorno: no se prueba, y se dice)');
    return;
  }
  const c = await creditos();
  ok('Higgsfield contesta y trae créditos', c !== null && c.creditos >= 0, JSON.stringify(c));
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Pruebas de la corrida 6 — piezas, diseño y Asistente por proyecto\n');

  pruebaSpecs();

  try {
    await pruebaMemoriaDeDiseno();

    const nuevo = await montarProyecto('Nuevo');
    const conKit = await montarProyecto('ConMarca');

    const kit = await pruebaKit(conKit);
    await pruebaCompositor(conKit, kit);
    await pruebaAsistente(conKit, kit);
    pruebaPedidoDeImagen();
    await pruebaGuia(nuevo, conKit, kit);
    await pruebaHiggsfield();
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
