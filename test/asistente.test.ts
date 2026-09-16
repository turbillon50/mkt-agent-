/**
 * Pruebas de la corrida 8 — Goossip siempre abierto: panel, compose y lectura
 * real de adjuntos.
 *
 *   npx tsx test/asistente.test.ts
 *
 * Qué se prueba y por qué cada una está aquí:
 *
 *  1. QUÉ SE ACEPTA. Cada familia con su tope, y lo que no se puede leer
 *     rechazado ANTES de subirlo. Aceptar un `.exe` y descubrirlo al leerlo es
 *     cobrarle al usuario la subida de algo que nunca iba a servir.
 *  2. LOS COMANDOS. Que `/pieza` se expanda, que `/publica` no exista para
 *     quien no puede operar, y que un `/loquesea` que no existe se quede como
 *     texto en vez de tirar el turno.
 *  3. EL CANDADO DE AUTONOMÍA. "Publica solo" pedido por un lector sale como
 *     "Propone". Es la prueba del candado, no del selector.
 *  4. LOS HILOS. Que el historial sea POR PROYECTO de verdad: el hilo del
 *     cliente A no aparece ni se abre desde el B, aunque se sepa su id. Y que
 *     la búsqueda mire el contenido de los mensajes, no solo el título.
 *  5. LOS ADJUNTOS. Que `archivosPorId` no cruce proyectos, que borrar un hilo
 *     NO borre sus archivos (o quedarían bytes pagados sin dueño) y que la
 *     lectura se guarde para no repetirla.
 *  6. LA LECTURA REAL, con archivos de verdad servidos por HTTP: PDF, DOCX,
 *     PPTX, XLSX, CSV y TXT. Nada de simulacros: si el lector de PPTX se
 *     rompe, esta prueba se pone roja.
 *  7. LAS PREFERENCIAS DEL PANEL. Que el ancho se acote y que guardar el panel
 *     NO borre lo demás que viva en `users.settings` — que es exactamente el
 *     bug del guardado parcial del kit de marca de la corrida 6.
 *  8. LAS MENCIONES. Que `@` traiga leads REALES del proyecto y que un id de
 *     otro proyecto no entre al contexto.
 *
 * Todo lo que crea en la base se borra al final, pase o falle.
 */
import '../src/env';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { eq, inArray } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { db } from '../src/db/client';
import {
  assistantConversations,
  assistantFiles,
  assistantMessages,
  campaigns,
  organizations,
  salesLeads,
  users,
  type Project,
} from '../src/db/schema';
import { autonomiaEfectiva } from '../src/assistant/autonomia';
import { buscarComando, comandosQueEmpiezanCon, expandirComando } from '../src/assistant/comandos';
import {
  archivosPorId,
  borrarHilo,
  crearHilo,
  getHilo,
  guardarMensaje,
  hiloParaEscribir,
  listarHilos,
  marcarLectura,
  mensajesDelHilo,
  registrarArchivo,
  tituloDesde,
} from '../src/assistant/hilos';
import { leerAdjunto } from '../src/assistant/lectura';
import { buscarMenciones, contextoDeMenciones } from '../src/assistant/menciones';
import {
  acotarAncho,
  guardarPreferencias,
  leerPreferencias,
  PANEL_MAX,
  PANEL_MIN,
} from '../src/assistant/preferencias';
import { pesoLegible, revisarArchivo, tipoDe } from '../src/assistant/tipos-archivo';

let pasadas = 0;
const fallidas: string[] = [];

function ok(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) pasadas += 1;
  else fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const SUFIJO = `c8-${Date.now()}`;
const ORG = `org_${SUFIJO}`;
const creados = { proyectos: [] as string[], usuarios: [] as string[] };

async function montarProyecto(nombre: string): Promise<{ project: Project; userId: string }> {
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
    })
    .returning();
  creados.proyectos.push(p!.id);
  return { project: p!, userId: u!.id };
}

async function limpiar() {
  if (creados.proyectos.length) {
    await db.delete(assistantFiles).where(inArray(assistantFiles.projectId, creados.proyectos));
    await db.delete(assistantMessages).where(inArray(assistantMessages.projectId, creados.proyectos));
    await db
      .delete(assistantConversations)
      .where(inArray(assistantConversations.projectId, creados.proyectos));
    await db.delete(salesLeads).where(inArray(salesLeads.campaignId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
  }
  if (creados.usuarios.length) {
    await db.delete(users).where(inArray(users.id, creados.usuarios));
  }
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

// ---------------------------------------------------------------------------
// 1. Qué se acepta
// ---------------------------------------------------------------------------

function pruebaTipos() {
  const MB = 1024 * 1024;

  ok('un PDF se acepta', revisarArchivo('brochure.pdf', 'application/pdf', 2 * MB).ok);
  ok('un MP4 se acepta', revisarArchivo('reel.mp4', 'video/mp4', 80 * MB).ok);
  ok('un XLSX se acepta', revisarArchivo('leads.xlsx', '', 1 * MB).ok);

  const exe = revisarArchivo('virus.exe', 'application/octet-stream', 1000);
  ok('un .exe se rechaza', !exe.ok, exe.motivo);
  ok('… y el motivo dice qué sí se puede', /imágenes, video, audio, PDF/.test(exe.motivo ?? ''));

  const gordo = revisarArchivo('pelicula.mp4', 'video/mp4', 300 * MB);
  ok('un video de 300 MB se rechaza', !gordo.ok);
  ok('… y el motivo trae el peso', /300 MB/.test(gordo.motivo ?? ''), gordo.motivo);

  const vacio = revisarArchivo('nada.txt', 'text/plain', 0);
  ok('un archivo vacío se rechaza', !vacio.ok, vacio.motivo);

  // El MIME que manda el navegador miente; la extensión no. Un CSV exportado de
  // Excel llega como `application/vnd.ms-excel` y tiene que entrar como hoja.
  ok('el CSV con MIME de Excel entra como hoja', tipoDe('leads.csv', 'application/vnd.ms-excel')?.familia === 'hoja');
  // Y al revés: sin extensión útil, manda el MIME.
  ok('lo pegado sin nombre cae al MIME', tipoDe('blob', 'image/png')?.familia === 'imagen');

  // HEIC se ACEPTA y se declara ilegible. Rechazarlo sería mentirle al usuario
  // sobre lo que su teléfono produce por omisión.
  ok('el HEIC se acepta', revisarArchivo('IMG_0001.heic', 'image/heic', 3 * MB).ok);
  ok('… pero no tiene lector', tipoDe('IMG_0001.heic', 'image/heic')?.lector === 'ninguno');

  ok('el peso se lee en español', pesoLegible(1536) === '2 KB', pesoLegible(1536));
  ok('… y en MB con decimal cuando es chico', pesoLegible(3 * MB) === '3.0 MB', pesoLegible(3 * MB));
}

// ---------------------------------------------------------------------------
// 2. Los comandos
// ---------------------------------------------------------------------------

function pruebaComandos() {
  const pieza = expandirComando('/pieza para el lanzamiento del martes');
  ok('/pieza se expande', pieza.includes('lanzamiento del martes') && pieza.includes('tres opciones'), pieza);
  ok('… y no queda la barra', !pieza.startsWith('/'));

  const medidas = expandirComando('/medidas un reel de Instagram');
  ok('/medidas pide la fuente', /CITA la fuente|cita la fuente/i.test(medidas), medidas);

  // Con acento y sin acento, el mismo comando.
  ok('/campaña con acento existe', buscarComando('campaña') !== null);
  ok('/campana sin acento existe', buscarComando('campana') !== null);

  // Sin argumento no se inventa uno.
  const vacio = expandirComando('/pieza');
  ok('/pieza sin argumento pregunta', /pregúntame|Pregúntame/.test(vacio), vacio);

  // Un comando que no existe es texto, no un error.
  ok('/loquesea se queda como texto', expandirComando('/loquesea hola') === '/loquesea hola');
  ok('el texto normal no se toca', expandirComando('hola, ¿cómo vas?') === 'hola, ¿cómo vas?');

  const deLector = comandosQueEmpiezanCon('', false).map((c) => c.nombre);
  const deOperador = comandosQueEmpiezanCon('', true).map((c) => c.nombre);
  ok('un lector no ve /publica', !deLector.includes('publica'), deLector.join(','));
  ok('quien opera sí lo ve', deOperador.includes('publica'));
  ok('el menú filtra por prefijo', comandosQueEmpiezanCon('pi', true).every((c) => c.nombre.startsWith('pi')));
}

// ---------------------------------------------------------------------------
// 3. El candado de autonomía
// ---------------------------------------------------------------------------

function pruebaTitulos() {
  ok('un título largo se corta con puntos suspensivos', tituloDesde('a'.repeat(200)).endsWith('…'));
  ok('… y por palabra, no a media letra', !/aaa…$/.test(tituloDesde(`${'palabra '.repeat(20)}`)));
  ok('un mensaje vacío tiene título de todas formas', tituloDesde('   ') === 'Conversación');
  ok('un mensaje corto se queda igual', tituloDesde('Hola') === 'Hola');
}

function pruebaAutonomia() {
  ok('quien opera puede publicar solo', autonomiaEfectiva('publica', true) === 'publica');
  ok('UN LECTOR NO', autonomiaEfectiva('publica', false) === 'propone');
  ok('lo que no se entiende cae a propone', autonomiaEfectiva('loquesea', true) === 'propone');
  ok('sin selector, propone', autonomiaEfectiva(undefined, true) === 'propone');
}

// ---------------------------------------------------------------------------
// 4. Los hilos
// ---------------------------------------------------------------------------

async function pruebaHilos(a: { project: Project; userId: string }, b: { project: Project; userId: string }) {
  const ambitoA = { orgId: ORG, projectId: a.project.id, userId: a.userId };
  const ambitoB = { orgId: ORG, projectId: b.project.id, userId: b.userId };

  const hilo = await crearHilo(ambitoA);
  ok('el hilo nace sin título', hilo.title === null);

  await guardarMensaje({
    ambito: ambitoA,
    conversationId: hilo.id,
    role: 'user',
    content: 'Hazme tres piezas para el lanzamiento de la torre en Polanco',
  });
  const conTitulo = await getHilo(ambitoA, hilo.id);
  ok('el primer mensaje le pone título', Boolean(conTitulo?.title), String(conTitulo?.title));
  ok(
    '… con las primeras palabras',
    (conTitulo?.title ?? '').startsWith('Hazme tres piezas'),
    String(conTitulo?.title),
  );

  await guardarMensaje({
    ambito: ambitoA,
    conversationId: hilo.id,
    role: 'assistant',
    content: 'Van tres opciones con la paleta del kit.',
  });
  await guardarMensaje({
    ambito: ambitoA,
    conversationId: hilo.id,
    role: 'user',
    content: 'La segunda, pero en azul',
  });

  const reTitulado = await getHilo(ambitoA, hilo.id);
  ok(
    'el título NO cambia con el segundo mensaje',
    reTitulado?.title === conTitulo?.title,
    `${conTitulo?.title} → ${reTitulado?.title}`,
  );

  const mensajes = await mensajesDelHilo(ambitoA, hilo.id);
  ok('los mensajes vuelven en orden', mensajes.length === 3 && mensajes[0]!.role === 'user');

  // EL AISLAMIENTO. Es la razón de existir de la tabla.
  ok('el hilo de A no se abre desde B', (await getHilo(ambitoB, hilo.id)) === null);
  const listaB = await listarHilos(ambitoB);
  ok('… ni aparece en la lista de B', !listaB.some((h) => h.id === hilo.id), `${listaB.length} hilos`);

  // Un id que no es de este proyecto NO tumba el turno: abre uno nuevo.
  const rescate = await hiloParaEscribir(ambitoB, hilo.id);
  ok('un id ajeno abre un hilo nuevo, no revienta', rescate.id !== hilo.id);
  ok('… y el nuevo es del proyecto correcto', rescate.projectId === b.project.id);

  // La búsqueda mira el CONTENIDO, no solo el título.
  const porContenido = await listarHilos(ambitoA, { q: 'azul' });
  ok('buscar encuentra por contenido del mensaje', porContenido.some((h) => h.id === hilo.id));
  const porTitulo = await listarHilos(ambitoA, { q: 'Polanco' });
  ok('… y por título', porTitulo.some((h) => h.id === hilo.id));
  const sinNada = await listarHilos(ambitoA, { q: 'zzzznoexiste' });
  ok('y no inventa resultados', sinNada.length === 0, `${sinNada.length}`);

  ok('la lista trae el conteo de mensajes', (porContenido[0]?.mensajes ?? 0) === 3, String(porContenido[0]?.mensajes));

  return { hilo, ambitoA, ambitoB, hiloDeB: rescate };
}

// ---------------------------------------------------------------------------
// 5. Los adjuntos
// ---------------------------------------------------------------------------

async function pruebaAdjuntos(ctx: Awaited<ReturnType<typeof pruebaHilos>>) {
  const { ambitoA, ambitoB, hilo } = ctx;

  const archivo = await registrarArchivo({
    ambito: ambitoA,
    conversationId: hilo.id,
    name: 'brochure.pdf',
    url: 'https://ejemplo.mx/brochure.pdf',
    mime: 'application/pdf',
    size: 1234567,
    storage: 'casa',
  });
  ok('el archivo nace sin leer', archivo.extractStatus === 'pendiente');

  const ajeno = await registrarArchivo({
    ambito: ambitoB,
    conversationId: null,
    name: 'otro.pdf',
    url: 'https://ejemplo.mx/otro.pdf',
    mime: 'application/pdf',
    size: 100,
    storage: 'casa',
  });

  // Pedir los dos ids DESDE el proyecto A tiene que devolver uno solo.
  const traidos = await archivosPorId(ambitoA.projectId, [archivo.id, ajeno.id]);
  ok('archivosPorId no cruza proyectos', traidos.length === 1 && traidos[0]!.id === archivo.id, `${traidos.length}`);

  // Un id inventado no tumba la consulta.
  ok('un id basura se ignora', (await archivosPorId(ambitoA.projectId, ['no-soy-uuid'])).length === 0);

  await marcarLectura(archivo.id, ambitoA.projectId, {
    estado: 'leido',
    texto: 'Torre de 24 niveles en Polanco. Entrega 2028.',
    nota: '12 páginas.',
  });
  const [releido] = await archivosPorId(ambitoA.projectId, [archivo.id]);
  ok('la lectura se guarda', releido?.extractStatus === 'leido');
  ok('… con su texto', (releido?.extractedText ?? '').includes('Polanco'));

  // Marcar desde otro proyecto no hace nada. El `projectId` del WHERE no es
  // adorno.
  await marcarLectura(archivo.id, ambitoB.projectId, { estado: 'error', texto: null, nota: 'hackeado' });
  const [intacto] = await archivosPorId(ambitoA.projectId, [archivo.id]);
  ok('NO se puede marcar un archivo de otro proyecto', intacto?.extractStatus === 'leido', String(intacto?.extractStatus));

  // Borrar el hilo se lleva los mensajes y NO los archivos.
  const antes = (await mensajesDelHilo(ambitoA, hilo.id)).length;
  ok('el hilo tenía mensajes', antes > 0, String(antes));
  ok('se borra', await borrarHilo(ambitoA, hilo.id));
  ok('los mensajes se fueron con él', (await mensajesDelHilo(ambitoA, hilo.id)).length === 0);

  const [sobreviviente] = await archivosPorId(ambitoA.projectId, [archivo.id]);
  ok('EL ARCHIVO SOBREVIVE al borrado del hilo', Boolean(sobreviviente), 'si no, quedan bytes pagados sin dueño');
  ok('… y se queda sin hilo', sobreviviente?.conversationId === null, String(sobreviviente?.conversationId));

  // Borrar un hilo de otro no se puede.
  ok('no se borra un hilo ajeno', !(await borrarHilo(ambitoB, 'ffffffff-ffff-4fff-8fff-ffffffffffff')));
}

// ---------------------------------------------------------------------------
// 6. La lectura REAL, con archivos de verdad
// ---------------------------------------------------------------------------

/** Un PDF de dos páginas, escrito a mano. Sin comprimir, para que sea legible. */
function pdfDeDosPaginas(): Buffer {
  const pagina = (texto: string) => `BT /F1 14 Tf 72 700 Td (${texto}) Tj ET`;
  const objetos: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    null as never,
    null as never,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const flujo1 = pagina('Torre Polanco: 24 niveles, entrega 2028.');
  const flujo2 = pagina('Amenidades: alberca, gimnasio, roof garden.');
  objetos[4] = `<< /Length ${flujo1.length} >>\nstream\n${flujo1}\nendstream`;
  objetos[5] = `<< /Length ${flujo2.length} >>\nstream\n${flujo2}\nendstream`;

  let cuerpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(cuerpo.length);
    cuerpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioXref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, '0')} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(cuerpo, 'latin1');
}

/** Un DOCX de verdad: un zip con las partes mínimas que pide mammoth. */
function docxReal(parrafos: string[]): Buffer {
  const cuerpo = parrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/document.xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`,
      ),
    }),
  );
}

/** Un PPTX de tres diapositivas, numeradas fuera de orden a propósito. */
function pptxReal(): Buffer {
  const diapositiva = (textos: string[]) =>
    strToU8(
      `<?xml version="1.0"?><p:sld xmlns:p="x" xmlns:a="y"><p:cSld><p:spTree>${textos
        .map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
        .join('')}</p:spTree></p:cSld></p:sld>`,
    );
  return Buffer.from(
    zipSync({
      'ppt/slides/slide10.xml': diapositiva(['Diez: el cierre']),
      'ppt/slides/slide2.xml': diapositiva(['Dos: el problema', 'Nadie contesta los leads']),
      'ppt/slides/slide1.xml': diapositiva(['Uno: la portada']),
    }),
  );
}

function xlsxReal(): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Teléfono', 'Etapa'],
      ['Ana Gómez', '5512345678', 'nuevo'],
      ['Luis Pérez', '5598765432', 'contactado'],
    ]),
    'Leads',
  );
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function pruebaLecturaReal() {
  const archivos: Record<string, { bytes: Buffer; mime: string }> = {
    '/brochure.pdf': { bytes: pdfDeDosPaginas(), mime: 'application/pdf' },
    '/propuesta.docx': {
      bytes: docxReal(['Propuesta comercial', 'Tres piezas al mes y un reporte.']),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    '/pitch.pptx': {
      bytes: pptxReal(),
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    '/leads.xlsx': { bytes: xlsxReal(), mime: 'application/vnd.ms-excel' },
    '/leads.csv': {
      bytes: Buffer.from('nombre,telefono\nAna,5512345678\nLuis,5598765432\n', 'utf8'),
      mime: 'text/csv',
    },
    '/notas.txt': { bytes: Buffer.from('El tono es cálido y directo.', 'utf8'), mime: 'text/plain' },
    '/raro.exe': { bytes: Buffer.from('MZ'), mime: 'application/octet-stream' },
    '/foto.heic': { bytes: Buffer.alloc(2048, 7), mime: 'image/heic' },
  };

  const servidor: Server = createServer((req, res) => {
    const a = archivos[req.url ?? ''];
    if (!a) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Length': String(a.bytes.byteLength) });
    res.end(a.bytes);
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = (servidor.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${puerto}`;

  try {
    const leer = (ruta: string) =>
      leerAdjunto({
        nombre: ruta.slice(1),
        url: `${base}${ruta}`,
        mime: archivos[ruta]!.mime,
        size: archivos[ruta]!.bytes.byteLength,
      });

    const pdf = await leer('/brochure.pdf');
    ok('el PDF se lee', pdf.estado === 'leido', `${pdf.estado} · ${pdf.nota}`);
    ok('… y trae el texto de la página 1', (pdf.texto ?? '').includes('Torre Polanco'), (pdf.texto ?? '').slice(0, 80));
    ok('… y el de la página 2', (pdf.texto ?? '').includes('roof garden'));
    ok('… y dice cuántas páginas son', /2 páginas/.test(pdf.nota ?? ''), String(pdf.nota));

    const docx = await leer('/propuesta.docx');
    ok('el DOCX se lee', docx.estado === 'leido', `${docx.estado} · ${docx.nota}`);
    ok('… con sus párrafos', (docx.texto ?? '').includes('Tres piezas al mes'), (docx.texto ?? '').slice(0, 80));

    const pptx = await leer('/pitch.pptx');
    ok('el PPTX se lee', pptx.estado === 'leido', `${pptx.estado} · ${pptx.nota}`);
    ok('… con el texto de las diapositivas', (pptx.texto ?? '').includes('Nadie contesta los leads'));
    // La 10 va DESPUÉS de la 2: ordenar por nombre pondría slide10 antes de slide2.
    ok(
      '… en el orden de la presentación, no el alfabético',
      (pptx.texto ?? '').indexOf('Dos: el problema') < (pptx.texto ?? '').indexOf('Diez: el cierre'),
      (pptx.texto ?? '').replace(/\n/g, ' | ').slice(0, 120),
    );

    const xlsx = await leer('/leads.xlsx');
    ok('el XLSX se lee', xlsx.estado === 'leido', `${xlsx.estado} · ${xlsx.nota}`);
    ok('… con sus celdas', (xlsx.texto ?? '').includes('5512345678'), (xlsx.texto ?? '').slice(0, 100));
    ok('… y dice cuántas filas trae', /3 filas/.test(xlsx.texto ?? ''), (xlsx.texto ?? '').slice(0, 60));

    const csv = await leer('/leads.csv');
    ok('el CSV se lee', csv.estado === 'leido' && (csv.texto ?? '').includes('5598765432'), csv.nota ?? '');

    const txt = await leer('/notas.txt');
    ok('el TXT se lee', txt.estado === 'leido' && (txt.texto ?? '').includes('cálido'), txt.nota ?? '');

    const exe = await leer('/raro.exe');
    ok('el .exe no se lee', exe.estado === 'sin-lector', exe.estado);

    const heic = await leer('/foto.heic');
    ok('el HEIC dice POR QUÉ no se puede', /HEIC|iPhone/.test(heic.nota ?? ''), String(heic.nota));
    ok('… y no inventa texto', heic.texto === null);

    // Un archivo que ya no está: se dice, no se cae.
    const muerto = await leerAdjunto({
      nombre: 'perdido.pdf',
      url: `${base}/no-existe.pdf`,
      mime: 'application/pdf',
      size: 100,
    });
    ok('un archivo que no está da error con motivo', muerto.estado === 'error' && /404/.test(muerto.nota ?? ''), String(muerto.nota));
  } finally {
    await new Promise<void>((r) => servidor.close(() => r()));
  }
}

// ---------------------------------------------------------------------------
// 7. Las preferencias del panel
// ---------------------------------------------------------------------------

async function pruebaPreferencias(userId: string) {
  ok('el ancho se acota por abajo', acotarAncho(10) === PANEL_MIN, String(acotarAncho(10)));
  ok('… y por arriba', acotarAncho(9000) === PANEL_MAX, String(acotarAncho(9000)));
  ok('… y la basura cae al valor de fábrica', acotarAncho('hola') === 360, String(acotarAncho('hola')));

  ok('sin nada guardado, los valores de fábrica', leerPreferencias(null).ancho === 360);

  // Se siembra otra preferencia ajena para probar que no se la lleva.
  await db.update(users).set({ settings: { algoMio: 'no me borres' } }).where(eq(users.id, userId));

  const guardadas = await guardarPreferencias(userId, { ancho: 400, plegado: true });
  ok('el ancho se guarda', guardadas.ancho === 400, String(guardadas.ancho));
  ok('el plegado se guarda', guardadas.plegado === true);

  const [fila] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
  ok('NO se borró lo que había al lado', (fila?.settings as any)?.algoMio === 'no me borres', JSON.stringify(fila?.settings));

  // Un guardado parcial no debe tirar lo anterior.
  const parcial = await guardarPreferencias(userId, { autonomia: 'publica' });
  ok('un guardado parcial conserva el ancho', parcial.ancho === 400, String(parcial.ancho));
  ok('… y el plegado', parcial.plegado === true);
  ok('… y guarda lo nuevo', parcial.autonomia === 'publica');

  // Un ancho fuera de rango se acota al guardar, no se guarda tal cual.
  const acotado = await guardarPreferencias(userId, { ancho: 5000 });
  ok('un ancho absurdo se acota al guardar', acotado.ancho === PANEL_MAX, String(acotado.ancho));
}

// ---------------------------------------------------------------------------
// 8. Las menciones
// ---------------------------------------------------------------------------

async function pruebaMenciones(a: { project: Project; userId: string }, b: { project: Project; userId: string }) {
  const [leadA] = await db
    .insert(salesLeads)
    .values({
      orgId: ORG,
      userId: a.userId,
      campaignId: a.project.id,
      fullName: 'Ana Gómez',
      phone: '5512345678',
      stage: 'nuevo',
    })
    .returning();

  const [leadB] = await db
    .insert(salesLeads)
    .values({
      orgId: ORG,
      userId: b.userId,
      campaignId: b.project.id,
      fullName: 'Secreto del otro cliente',
      phone: '5500000000',
      stage: 'nuevo',
    })
    .returning();

  const sugeridas = await buscarMenciones(a.project, ORG, 'Ana');
  ok('@ trae leads reales del proyecto', sugeridas.some((m) => m.id === leadA!.id), `${sugeridas.length}`);
  ok('… con su etiqueta', sugeridas.find((m) => m.id === leadA!.id)?.etiqueta === 'Ana Gómez');
  ok('… y su etapa de detalle', /nuevo/.test(sugeridas.find((m) => m.id === leadA!.id)?.detalle ?? ''));

  const cruzadas = await buscarMenciones(a.project, ORG, 'Secreto');
  ok('NO trae leads de otro proyecto', !cruzadas.some((m) => m.id === leadB!.id), `${cruzadas.length}`);

  const contexto = await contextoDeMenciones(a.project, ORG, [{ tipo: 'lead', id: leadA!.id }]);
  ok('el contexto trae el teléfono real', (contexto ?? '').includes('5512345678'), String(contexto));

  const contextoAjeno = await contextoDeMenciones(a.project, ORG, [{ tipo: 'lead', id: leadB!.id }]);
  ok('un id de otro proyecto no entra al contexto', contextoAjeno === null, String(contextoAjeno));

  // Un id inventado tampoco tumba nada.
  const inventado = await contextoDeMenciones(a.project, ORG, [
    { tipo: 'lead', id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
  ]);
  ok('un id inventado se ignora', inventado === null);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Pruebas de la corrida 8 — Goossip siempre abierto\n');

  pruebaTipos();
  pruebaComandos();
  pruebaAutonomia();
  pruebaTitulos();

  try {
    await pruebaLecturaReal();

    const a = await montarProyecto('Torre');
    const b = await montarProyecto('Otro');

    const ctx = await pruebaHilos(a, b);
    await pruebaAdjuntos(ctx);
    await pruebaPreferencias(a.userId);
    await pruebaMenciones(a, b);
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
