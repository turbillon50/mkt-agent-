/**
 * Ingesta de la memoria de diseño de Goossip.
 *
 *   npm run ingest:diseno            → ingiere lo que cambió
 *   npm run ingest:diseno -- --dry   → dice qué haría, sin escribir
 *
 * Idempotente de verdad: la llave es `(source_path, chunk_index)` y el hash es
 * del archivo COMPLETO. Correrlo dos veces seguidas escribe CERO pedazos y no
 * pide ni un embedding — que es la prueba 4 del issue.
 *
 * De dónde saca lo que sabe, en orden:
 *
 *   1. `/root/skills-vault` — las skills de Higgsfield, el protocolo de diseño,
 *      la biblioteca de estilos, el motor de contenido y el kit de vdefi como
 *      ejemplo. Son markdown de la casa y se leen del disco del servidor.
 *   2. Las medidas oficiales por red (`src/creative/specs.ts`), cada una con su
 *      URL oficial y la fecha en que se leyó. El `source_path` de esas ES la
 *      URL: preguntada la spec, el Asistente puede citar de dónde salió.
 *   3. El Brain, si hay `BRAIN_DATABASE_URL`. Se traen las memorias de diseño,
 *      marca y campañas con importancia alta. Sin la variable, este paso se
 *      salta y se dice — no se inventa.
 *
 * Ojo con lo que NO hace: no toca `knowledge`. Eso es del cliente, por
 * organización. Esto es de la aplicación y vive en `design_knowledge` con
 * `scope='global'`.
 */
import '../src/env';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  contarDiseno,
  hashesGuardados,
  hashOf,
  ingestSource,
  partirMarkdown,
  podarFuentesAusentes,
  reporteVacio,
  type DesignCategory,
  type DesignSource,
} from '../src/design/knowledge';
import { FORMATOS, RED_LABEL, REDES, specEnPalabras, type RedSlug } from '../src/creative/specs';
import { REGLAS, LIMITES, reglaEnPalabras } from '../src/creative/reglas';
import { CORTES, corteEnPalabras } from '../src/creative/cortes';
import { config } from '../src/config';

const VAULT = process.env.SKILLS_VAULT_DIR || '/root/skills-vault';
const SECO = process.argv.includes('--dry');

/**
 * Las carpetas del issue, con la categoría que les toca. El orden importa poco;
 * la categoría sí: es lo que deja preguntar "solo Higgsfield" desde el
 * Asistente sin que se le cuele el manual de marca de vdefi.
 */
const CARPETAS: Array<{ dir: string; category: DesignCategory }> = [
  { dir: '_higgsfield-docs', category: 'higgsfield' },
  { dir: 'higgsfield-generate', category: 'higgsfield' },
  { dir: 'higgsfield-brandkit', category: 'higgsfield' },
  { dir: 'higgsfield-soul-id', category: 'higgsfield' },
  { dir: 'higgsfield-product-photoshoot', category: 'higgsfield' },
  { dir: 'higgsfield-video-explainer', category: 'higgsfield' },
  { dir: 'higgsfield-websites', category: 'higgsfield' },
  { dir: 'higgsfield-youtube-thumbnail', category: 'higgsfield' },
  { dir: 'higgsfield-marketplace-cards', category: 'higgsfield' },
  { dir: 'content-engine', category: 'diseno' },
  { dir: 'design-library', category: 'diseno' },
  { dir: 'vulcano-design-protocol', category: 'diseno' },
  { dir: 'video-frames', category: 'diseno' },
  { dir: 'vdefi-brand', category: 'marca' },
];

/**
 * El issue los pide "si están en el servidor". No están (medido: no existe
 * `/mnt/skills`), así que se toman del repo skills-vault, que es justo lo que
 * el issue manda hacer en ese caso. Se dejan declarados para que la corrida lo
 * reporte en vez de callarlo.
 */
const MNT = ['/mnt/skills/user/content-engine', '/mnt/skills/examples/canvas-design'];

async function archivosMd(dir: string): Promise<string[]> {
  const salida: string[] = [];
  const caminar = async (d: string) => {
    let entradas;
    try {
      entradas = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // Ni node_modules ni .git: son megas de ruido que no enseñan a diseñar.
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        await caminar(p);
      } else if (/\.(md|markdown)$/i.test(e.name)) {
        salida.push(p);
      }
    }
  };
  await caminar(dir);
  return salida.sort();
}

async function fuentesDeSkills(): Promise<{ fuentes: DesignSource[]; faltantes: string[] }> {
  const fuentes: DesignSource[] = [];
  const faltantes: string[] = [];

  for (const { dir, category } of CARPETAS) {
    const abs = path.join(VAULT, dir);
    if (!existsSync(abs)) {
      faltantes.push(abs);
      continue;
    }
    for (const archivo of await archivosMd(abs)) {
      const texto = await readFile(archivo, 'utf8');
      if (!texto.trim()) continue;
      const pedazos = partirMarkdown(texto);
      if (pedazos.length === 0) continue;
      fuentes.push({
        sourcePath: archivo,
        sourceHash: hashOf(texto),
        category,
        title: `${dir} · ${path.basename(archivo)}`,
        chunks: pedazos.map((p) => ({
          content: p.content,
          metadata: { skill: dir, archivo: path.relative(abs, archivo), seccion: p.titulo },
        })),
      });
    }
  }

  for (const m of MNT) if (!existsSync(m)) faltantes.push(m);

  return { fuentes, faltantes };
}

/**
 * Una fuente por formato. El `source_path` es la URL oficial, así que preguntar
 * "¿qué mide un reel?" devuelve el pedazo Y su procedencia sin trucos.
 */
function fuentesDeSpecs(): DesignSource[] {
  return FORMATOS.map((f) => {
    // `f.label` ya empieza por el nombre de la red ("Instagram — reel"), así
    // que anteponerle `RED_LABEL` otra vez dejaba el título como
    // "Instagram — Instagram — reel" y así se lo leía el Asistente al usuario.
    const texto = [
      specEnPalabras(f),
      `Palabras con las que se pregunta esto: ${RED_LABEL[f.red]}, ${f.label}, ${f.ratio}, ${f.tipo}, medidas, tamaño, resolución, peso, zona segura.`,
    ].join('\n\n');
    return {
      // Dos formatos pueden salir de la MISMA página (las tres proporciones de
      // LinkedIn vienen de un solo artículo). El id va en el ancla para que
      // cada uno sea su propia fuente y no se pisen el hash.
      sourcePath: `${f.fuente}#${f.id}`,
      sourceHash: hashOf(texto),
      category: 'spec-red' as const,
      title: f.label,
      chunks: [
        {
          content: texto,
          metadata: {
            red: f.red,
            formato: f.id,
            ratio: f.ratio,
            ancho: f.ancho,
            alto: f.alto,
            fuente: f.fuente,
            leidoEl: f.leidoEl,
          },
        },
      ],
    };
  });
}

/**
 * Las REGLAS de cada red y las leyes mexicanas (corrida 10).
 *
 * Una fuente por regla, y el `source_path` ES la URL oficial con el id en el
 * ancla. Eso es lo que hace que `buscar_en_diseno("límite de posts por día en
 * X")` conteste con la página de X y no con "según mis conocimientos": la
 * procedencia viaja PEGADA al texto, no en un comentario que nadie lee.
 *
 * `metadata.network` va en cada pedazo porque el issue lo pide por red y porque
 * el panel "cómo se postea aquí" filtra por ahí.
 */
function fuentesDeReglas(): DesignSource[] {
  const fuentes: DesignSource[] = REGLAS.map((r) => {
    const texto = [
      reglaEnPalabras(r),
      `Palabras con las que se pregunta esto: ${
        r.ambito === 'mexico' ? 'México, ley, PROFECO, LFPC, LFPDPPP' : RED_LABEL[r.ambito as RedSlug]
      }, ${r.titulo}, ${r.familia}, política, regla, límite, prohibido, baneo, sanción.`,
    ].join('\n\n');
    return {
      sourcePath: `${r.fuente}#${r.id}`,
      sourceHash: hashOf(texto),
      category: 'reglas' as const,
      title: r.titulo,
      chunks: [
        {
          content: texto,
          metadata: {
            network: r.ambito,
            regla: r.id,
            familia: r.familia,
            peso: r.peso,
            fuente: r.fuente,
            leidoEl: r.leidoEl,
          },
        },
      ],
    };
  });

  // Los topes por red, dichos en una sola ficha por red. Es la respuesta
  // literal a "¿cuántas publicaciones al día acepta X?", que es la prueba 4.
  for (const red of REDES) {
    const l = LIMITES[red];
    const corte = CORTES[red];
    const texto = [
      `Cuántas publicaciones al día acepta ${RED_LABEL[red]} por su API.`,
      l.porDia === null
        ? `${RED_LABEL[red]} NO publica un tope de publicaciones al día. ${l.nota}`
        : `${RED_LABEL[red]} acepta ${l.porDia} publicaciones por cuenta en 24 horas. ${l.nota}`,
      l.unidadesDia
        ? `Además lleva cuota por unidades: ${l.unidadesDia.total} unidades al día, ${l.unidadesDia.subidasDia} subidas de video, y cada escritura cuesta ${l.unidadesDia.porPublicar} unidades.`
        : null,
      corteEnPalabras(corte),
      `Palabras con las que se pregunta esto: límite de posts por día en ${RED_LABEL[red]}, cuántas publicaciones, cuota, rate limit, tope diario, caracteres, ver más.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const regla = REGLAS.find((r) => r.id === l.regla);
    fuentes.push({
      sourcePath: `${regla?.fuente ?? 'https://goossip.app'}#limites-${red}`,
      sourceHash: hashOf(texto),
      category: 'reglas',
      title: `${RED_LABEL[red]} — límites de publicación y de texto`,
      chunks: [
        {
          content: texto,
          metadata: {
            network: red,
            tipo: 'limites',
            porDia: l.porDia,
            publicado: l.publicado,
            fuente: regla?.fuente ?? null,
            leidoEl: regla?.leidoEl ?? null,
          },
        },
      ],
    });
  }

  return fuentes;
}

/**
 * El Brain, si se puede. Se piden las memorias de diseño, marca, campaña y
 * pieza que NO estén marcadas como caducas y que tengan importancia de 6 para
 * arriba — las de abajo son bitácora del día, no conocimiento.
 *
 * Se excluyen los `[DRAIN]`: son mensajes entre agentes, no doctrina de diseño.
 */
async function fuentesDelBrain(): Promise<{ fuentes: DesignSource[]; nota: string }> {
  const url = process.env.BRAIN_DATABASE_URL;
  if (!url) {
    return {
      fuentes: [],
      nota: 'BRAIN_DATABASE_URL no está en el entorno: no se ingirió nada del Brain.',
    };
  }
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      topic: string | null;
      content: string;
      type: string | null;
      importance: number | null;
      updated_at: Date | null;
    }>(`
      SELECT id::text, topic, content, type, importance, updated_at
      FROM memory
      WHERE stale IS NOT TRUE
        AND coalesce(importance, 0) >= 6
        AND coalesce(topic, '') NOT LIKE '[DRAIN]%'
        AND length(content) > 200
        AND (
          topic   ILIKE '%dise%' OR topic   ILIKE '%marca%'  OR topic ILIKE '%campa%'
          OR topic ILIKE '%pieza%' OR topic ILIKE '%meta%'   OR topic ILIKE '%higgsfield%'
          OR topic ILIKE '%paleta%' OR topic ILIKE '%contrast%' OR topic ILIKE '%ui%'
          OR content ILIKE '%higgsfield%' OR content ILIKE '%carrusel%'
          OR content ILIKE '%paleta%'     OR content ILIKE '%tipograf%'
        )
      ORDER BY importance DESC, updated_at DESC
      LIMIT 200
    `);

    const fuentes: DesignSource[] = rows
      .map((r) => {
        const texto = [r.topic ? `# ${r.topic}` : null, r.content].filter(Boolean).join('\n\n');
        const pedazos = partirMarkdown(texto);
        if (pedazos.length === 0) return null;
        return {
          sourcePath: `brain:memory/${r.id}`,
          sourceHash: hashOf(texto),
          category: 'brain' as const,
          title: r.topic ?? `Memoria ${r.id}`,
          chunks: pedazos.map((p) => ({
            content: p.content,
            metadata: { brainId: r.id, tipo: r.type, importancia: r.importance },
          })),
        };
      })
      .filter((f): f is DesignSource => f !== null);

    return { fuentes, nota: `Brain: ${rows.length} memorias leídas.` };
  } finally {
    await client.end();
  }
}

async function main() {
  if (!config.db.url) throw new Error('DATABASE_URL no está puesta.');

  console.log(`Memoria de diseño — ${SECO ? 'ENSAYO (no escribe)' : 'ingesta'}`);
  console.log(`Embeddings: ${config.embeddings.enabled ? config.embeddings.model : 'APAGADOS'}`);

  const { fuentes: deSkills, faltantes } = await fuentesDeSkills();
  const deSpecs = fuentesDeSpecs();
  const deReglas = fuentesDeReglas();
  const { fuentes: deBrain, nota: notaBrain } = await fuentesDelBrain();

  const todas = [...deSkills, ...deSpecs, ...deReglas, ...deBrain];

  console.log(`  skills-vault : ${deSkills.length} archivos`);
  console.log(`  specs por red: ${deSpecs.length} formatos`);
  console.log(`  reglas       : ${deReglas.length} (${REGLAS.length} políticas + ${REDES.length} fichas de límites)`);
  console.log(`  brain        : ${deBrain.length} memorias · ${notaBrain}`);
  for (const f of faltantes) console.log(`  (no existe, se salta) ${f}`);

  if (SECO) {
    const chunks = todas.reduce((n, f) => n + f.chunks.length, 0);
    console.log(`\nEnsayo: ${todas.length} fuentes, ${chunks} pedazos. No se escribió nada.`);
    return;
  }

  const guardados = await hashesGuardados();
  const reporte = reporteVacio();

  for (const f of todas) {
    const n = await ingestSource(f, guardados, reporte);
    if (n > 0) console.log(`  + ${f.sourcePath} → ${n}`);
  }

  const podados = await podarFuentesAusentes(todas.map((f) => f.sourcePath));
  const total = await contarDiseno();

  console.log('\n--- resultado ---');
  console.log(`fuentes vistas   : ${reporte.fuentesVistas}`);
  console.log(`  nuevas         : ${reporte.fuentesNuevas}`);
  console.log(`  cambiadas      : ${reporte.fuentesCambiadas}`);
  console.log(`  sin cambio     : ${reporte.fuentesSinCambio}`);
  console.log(`pedazos escritos : ${reporte.chunksEscritos}`);
  console.log(`pedazos borrados : ${reporte.chunksBorrados + podados}`);
  console.log(`embeddings       : ${reporte.embeddings}`);
  console.log(`en la base       : ${total.chunks} pedazos de ${total.fuentes} fuentes`);
  console.log(`por categoría    : ${JSON.stringify(total.porCategoria)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
