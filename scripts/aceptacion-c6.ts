/**
 * Las pruebas de aceptación del issue #39, contra los servicios DE VERDAD.
 *
 *   npx tsx scripts/aceptacion-c6.ts            → todo menos publicar
 *   npx tsx scripts/aceptacion-c6.ts --publicar → incluye publicar en LinkedIn
 *
 * No es `test/creative.test.ts`. Aquel prueba la lógica con datos de mentira y
 * corre en cada cambio. Este gasta modelos y publica de verdad en la cuenta de
 * un cliente, así que se corre a mano y publicar va detrás de una bandera.
 *
 * Las cinco del issue:
 *   1. "publica en LinkedIn: <texto>" desde el Asistente de MOMENTUM → sale con
 *      la cuenta del PROYECTO y devuelve URL. Y desde un proyecto sin LinkedIn,
 *      dice que ese proyecto no lo tiene.
 *   2. "Hazme la pieza para Instagram" → 3 opciones 4:5 con el logo y la paleta
 *      del kit de MOMENTUM.
 *   3. "¿qué medidas lleva un reel?" → la spec ingerida y su fuente.
 *   4. La ingesta: N archivos, M pedazos, re-corrida = 0 nuevos.
 *   5. (El deploy y las capturas van aparte.)
 */
import 'dotenv/config';
import sharp from 'sharp';
import { getProjectById } from '../src/sales/projects';
import { getBrandKit, kitCompleto, saveBrandKit } from '../src/creative/brand-kit';
import { proponerKit } from '../src/creative/proponer-kit';
import { generarPiezas } from '../src/creative/engine';
import { guardarLote } from '../src/creative/repo';
import { buscarDiseno, contarDiseno } from '../src/design/knowledge';
import { toolsParaProyecto } from '../src/agent/project-tools';
import { bajarImagen } from '../src/creative/media';
import { activeAccountFor } from '../src/projects/composio-connections';
import { pendientesDelProyecto } from '../src/assistant/guia';

const MOMENTUM = '5cf4d33c-3c3d-417a-a10d-212504d62773';
const SIN_LINKEDIN = 'b592116a-0f0a-433f-aa55-38e5c0988938'; // GOOSSIP
const LOGO = 'https://vmomentum.site/brand/mark.png';
const PUBLICAR = process.argv.includes('--publicar');

const medido: Record<string, unknown> = {};

function titulo(s: string) {
  console.log(`\n${'='.repeat(70)}\n${s}\n${'='.repeat(70)}`);
}

async function main() {
  const momentum = await getProjectById(MOMENTUM);
  if (!momentum) throw new Error('No encontré el proyecto MOMENTUM.');

  // --- El kit de marca, por el camino guiado de verdad --------------------
  titulo('KIT DE MARCA DE MOMENTUM — alta guiada con su logo real');

  let kit = await getBrandKit(momentum.orgId, momentum.id);
  if (!kitCompleto(kit)) {
    const bytes = await bajarImagen(LOGO);
    if (!bytes) throw new Error(`No pude bajar el logo de ${LOGO}`);
    const png = await sharp(bytes).resize({ width: 512, withoutEnlargement: true }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

    console.log(`logo: ${LOGO} (${Math.round(bytes.byteLength / 1024)} KB)`);
    const propuesta = await proponerKit({
      logoDataUrl: dataUrl,
      nombreProyecto: momentum.name,
      giro: momentum.kind,
      sitio: momentum.website,
    });
    console.log(`lo que vio el modelo: ${propuesta.lectura}`);
    console.log(`paleta propuesta: ${propuesta.paleta.map((c) => `${c.rol} ${c.hex}`).join(', ')}`);
    console.log(`tipografías: ${propuesta.tipografias.map((f) => f.familia).join(', ')}`);
    console.log(`tono: ${propuesta.tono.slice(0, 160)}`);

    kit = await saveBrandKit(
      momentum.orgId,
      momentum.id,
      {
        logoUrl: LOGO,
        paleta: propuesta.paleta,
        tipografias: propuesta.tipografias,
        tono: propuesta.tono,
        palabrasProhibidas: propuesta.palabrasProhibidas,
        propuesta: propuesta as unknown as Record<string, unknown>,
      },
      'aceptacion-c6',
    );
    medido.kitPropuestoPorGemini = true;
  } else {
    console.log('MOMENTUM ya tiene kit cargado; se usa el que hay.');
    medido.kitPropuestoPorGemini = false;
  }

  medido.kitPaleta = kit!.paleta.map((c) => `${c.rol}:${c.hex}`);
  medido.kitLogo = kit!.logoUrl;
  console.log(`kit vivo: ${medido.kitPaleta} · logo ${kit!.logoUrl}`);

  // --- Prueba 3: las medidas de un reel, con fuente -----------------------
  titulo('PRUEBA 3 — "¿qué medidas lleva un reel?"');

  const tools = toolsParaProyecto({
    project: momentum,
    orgId: momentum.orgId,
    quien: 'aceptacion-c6',
    puedeOperar: true,
    kit,
  });
  const medidas: any = await (tools.medidasDeRed as any).execute({ red: 'instagram', formato: 'reel' });
  console.log(medidas.respuesta);
  console.log(`\nfuente: ${medidas.fuente} · leída el ${medidas.leidoEl}`);
  medido.reel = { respuesta: medidas.respuesta, fuente: medidas.fuente, leidoEl: medidas.leidoEl };

  const busqueda = await buscarDiseno('¿qué medidas lleva un reel de Instagram?', { k: 1 });
  console.log(
    `\ny por la memoria de diseño (parecido ${busqueda[0]?.similarity.toFixed(3)}): ${busqueda[0]?.title}`,
  );
  medido.reelPorMemoria = { similitud: busqueda[0]?.similarity, fuente: busqueda[0]?.sourcePath };

  // --- Prueba 4: los números de la ingesta --------------------------------
  titulo('PRUEBA 4 — la memoria de diseño');
  const total = await contarDiseno();
  console.log(`${total.chunks} pedazos de ${total.fuentes} fuentes`);
  console.log(`por categoría: ${JSON.stringify(total.porCategoria)}`);
  medido.memoriaDeDiseno = total;

  // --- Prueba 2: la pieza para Instagram ----------------------------------
  titulo('PRUEBA 2 — "Hazme la pieza para Instagram de este post"');
  const brief =
    'Departamento modelo abierto este fin de semana en Polanco: visítalo sin cita y conoce los acabados.';

  const t0 = Date.now();
  const resultado = await generarPiezas({
    project: momentum,
    kit,
    red: 'instagram',
    brief,
    titular: 'Conoce el departamento modelo',
    cta: 'Agenda tu visita',
  });
  const filas = await guardarLote({ project: momentum, kit, red: 'instagram', brief, resultado });
  const segundos = Math.round((Date.now() - t0) / 1000);

  console.log(`formato: ${resultado.formato.label} · ${resultado.formato.ancho} × ${resultado.formato.alto} px (${resultado.formato.ratio})`);
  console.log(`opciones: ${filas.length} en ${segundos} s · compositor: ${resultado.compositor}`);
  console.log(`nota: ${resultado.notaCompositor}`);
  for (const f of filas) {
    console.log(`  · ${(f.metadata as any)?.angulo}: ${f.url}`);
  }
  if (resultado.fallos.length) {
    for (const x of resultado.fallos) console.log(`  (falló ${x.angulo}: ${x.motivo})`);
  }

  // Se mide la pieza de verdad: se baja y se le leen los píxeles.
  const comprobadas: Array<{ url: string; ancho?: number; alto?: number; kb: number }> = [];
  for (const f of filas) {
    if (!f.url) continue;
    const bytes = await bajarImagen(f.url);
    if (!bytes) {
      comprobadas.push({ url: f.url, kb: 0 });
      continue;
    }
    const m = await sharp(bytes).metadata();
    comprobadas.push({
      url: f.url,
      ancho: m.width,
      alto: m.height,
      kb: Math.round(bytes.byteLength / 1024),
    });
  }
  console.log('\nlo que mide cada pieza, bajada y medida:');
  for (const c of comprobadas) console.log(`  ${c.ancho}×${c.alto} · ${c.kb} KB · ${c.url}`);

  medido.piezas = {
    cuantas: filas.length,
    formato: resultado.formato.id,
    medidas: `${resultado.formato.ancho}x${resultado.formato.alto}`,
    segundos,
    compositor: resultado.compositor,
    nota: resultado.notaCompositor,
    comprobadas,
    fallos: resultado.fallos,
  };

  // --- Prueba 1b: un proyecto SIN LinkedIn lo dice ------------------------
  titulo('PRUEBA 1b — un proyecto sin LinkedIn dice que no lo tiene');
  const otro = await getProjectById(SIN_LINKEDIN);
  if (otro) {
    const toolsOtro = toolsParaProyecto({
      project: otro,
      orgId: otro.orgId,
      quien: 'aceptacion-c6',
      puedeOperar: true,
      kit: await getBrandKit(otro.orgId, otro.id),
    });
    try {
      await (toolsOtro.publicarPost as any).execute({ red: 'linkedin', texto: 'prueba' });
      console.log('✗ PUBLICÓ. Eso no debía pasar.');
      medido.sinLinkedIn = 'PUBLICÓ (mal)';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✓ ${msg}`);
      medido.sinLinkedIn = msg;
    }
  }

  // --- Prueba 1a: publicar de verdad en el LinkedIn de MOMENTUM -----------
  titulo('PRUEBA 1a — publicar en el LinkedIn de MOMENTUM');
  const cuenta = await activeAccountFor(momentum, 'linkedin');
  console.log(`cuenta del proyecto ante Composio: ${JSON.stringify(cuenta)}`);
  medido.identidadLinkedIn = cuenta?.userId ?? null;

  if (!PUBLICAR) {
    console.log('\n(sin --publicar: no se publica. El camino quedó comprobado hasta aquí.)');
  } else {
    const texto = `Goossip ya hace las piezas de cada publicación: elige la medida que pide la red, usa la paleta y el logo del proyecto y da tres opciones para escoger. — publicado por el Asistente de ${momentum.name}.`;
    try {
      const r: any = await (tools.publicarPost as any).execute({
        red: 'linkedin',
        texto,
        tema: 'Goossip corrida 6',
      });
      console.log(`✓ publicado con ${r.cuenta}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  con imagen: ${r.conImagen}`);
      medido.publicado = r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${msg}`);
      medido.publicado = { error: msg };
    }
  }

  // --- La guía activa ------------------------------------------------------
  titulo('GUÍA ACTIVA de MOMENTUM');
  const guia = await pendientesDelProyecto({ orgId: momentum.orgId, project: momentum, kit });
  console.log(`conectados: ${guia.conectados.join(', ') || 'ninguno'}`);
  console.log(`marca: ${guia.kitCompleto ? 'cargada' : 'sin cargar'} · leads sin contactar: ${guia.leadsSinContactar} · piezas sin decidir: ${guia.piezasSinDecidir}`);
  for (const s of guia.sugerencias) {
    console.log(`  [${s.urgencia}] ${s.texto}  →  ${s.accion.etiqueta}`);
  }
  medido.guia = {
    conectados: guia.conectados,
    sugerencias: guia.sugerencias.map((s) => ({ urgencia: s.urgencia, texto: s.texto, accion: s.accion.etiqueta })),
  };

  titulo('RESUMEN MEDIDO');
  console.log(JSON.stringify(medido, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
