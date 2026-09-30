/**
 * El mapa de públicos: segmento → dolor → oferta → etapa.
 *
 * Es el paso donde el motor deja de describir el mercado y empieza a decidir a
 * quién le habla. Referencias: los skills `customer-research`,
 * `marketing-psychology` y `offers` de coreyhaines31/marketingskills (MIT).
 *
 * El modelo propone; el código verifica. Dos candados, y el segundo es el que
 * importa:
 *
 *   1. `porque` es obligatorio. Un público sin argumento es una suposición con
 *      nombre bonito, y el issue pide estrategias ARGUMENTADAS.
 *   2. **La evidencia se comprueba contra las señales REALES del proyecto.** El
 *      modelo puede citar un id de señal que no existe —los modelos lo hacen— y si
 *      se le cree, la pantalla enseña "sostenido por la medición X" apuntando a
 *      nada. Los ids que no existen se tiran, igual que `creative/compliance.ts`
 *      tira una cita a una regla inexistente.
 *
 * Agnóstico al producto: todo lo que sabe del negocio viene de la ficha y del
 * radar. No hay ni una palabra de "apps" ni de "departamentos".
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  audiences,
  type Audience,
  type EtapaPublico,
  type MarketSignal,
  type NewAudience,
  type Project,
  type ProjectBrief,
} from '../db/schema';
import { chatJSON } from '../openrouter';
import { contextoDeFicha } from './ficha';
import { contextoDeRadar } from './radar';

export const ETAPAS: EtapaPublico[] = ['descubre', 'compara', 'compra', 'ya_te_busco'];

export const ETAPA_LABEL: Record<EtapaPublico, string> = {
  descubre: 'Apenas te descubre',
  compara: 'Te está comparando',
  compra: 'Listo para comprar',
  ya_te_busco: 'Ya te buscó',
};

/** Qué significa cada etapa para quien escribe. Va al prompt y a la pantalla. */
export const ETAPA_EXPLICACION: Record<EtapaPublico, string> = {
  descubre: 'Todavía no sabe que existes y quizá ni que tiene el problema. Hay que nombrarle el problema, no venderle.',
  compara: 'Ya sabe lo que quiere y está viendo opciones. Aquí gana quien enseña cómo trabaja y qué cuesta.',
  compra: 'Ya decidió y está resolviendo el cómo. Aquí lo que estorba es la fricción, no la falta de argumentos.',
  ya_te_busco: 'Ya te contactó o ya te compró. Aquí se juega la recompra y la recomendación, y casi nadie le habla.',
};

interface PropuestaPublico {
  nombre?: string;
  segmento?: string;
  dolor?: string;
  oferta?: string;
  etapa?: string;
  porque?: string;
  /** Ids de señales de mercado que lo sostienen. Se comprueban uno por uno. */
  evidencia?: string[];
  tamano_estimado?: number | null;
  /** Id de la señal que respalda el tamaño. Sin ella, el tamaño no se guarda. */
  tamano_senal?: string | null;
  prioridad?: number;
}

const SISTEMA = [
  'Eres el estratega que decide a QUIÉN le habla un negocio, a partir de su ficha y de lo que se midió del mercado.',
  '',
  'Devuelve entre 3 y 5 públicos. Cada uno con:',
  '- nombre: corto y reconocible, como lo diría el dueño.',
  '- segmento: quién es, concreto. No "millennials": "dueño de taller que factura y ya tiene contador".',
  '- dolor: el problema en SUS palabras, no en lenguaje de marketing.',
  '- oferta: qué le ofreces a ESE público. No la misma para todos.',
  '- etapa: una de descubre | compara | compra | ya_te_busco.',
  '- porque: el argumento. Obligatorio. Si te apoyas en una medición, cítala por su id.',
  '- evidencia: los ids EXACTOS de las señales de mercado que te di. Si no hay señal que lo',
  '  sostenga, deja la lista vacía y dilo en el porque. NO inventes ids.',
  '',
  'Reglas que no puedes romper:',
  '1. Cubre etapas DISTINTAS. Cuatro públicos todos en "compra" es un solo público mal partido.',
  '2. No repitas la misma oferta en dos públicos. Si la oferta es la misma, es el mismo público.',
  '3. Si el precio del negocio no se sabe, NO supongas uno ni digas "precio accesible".',
  '4. Solo pon tamano_estimado si tienes una señal que lo respalde, y pon su id en tamano_senal.',
  '   Sin señal, deja los dos en null. Un tamaño inventado es peor que no tenerlo.',
  '5. Español de México, claro, sin jerga. Como se lo explicarías al dueño en su mesa.',
  '',
  'Contesta SOLO JSON: {"publicos":[{"nombre":"","segmento":"","dolor":"","oferta":"",',
  '"etapa":"compara","porque":"","evidencia":["id"],"tamano_estimado":null,"tamano_senal":null,"prioridad":1}]}',
].join('\n');

function senalesEnTexto(senales: MarketSignal[]): string {
  if (!senales.length) return 'No hay señales de mercado medidas. No cites ninguna: deja `evidencia` vacía en todos.';
  const L = ['SEÑALES DE MERCADO MEDIDAS (cita por id EXACTO, no inventes ids):'];
  for (const s of senales) {
    const v = s.hueco ? 'SIN DATO' : `${s.valorNum ?? s.valorTexto ?? ''}${s.unidad ?? ''}`;
    L.push(`- id=${s.id} · ${s.etiqueta}: ${v}` + (s.hueco ? ` (hueco: ${s.comoMedirlo})` : ` (calidad ${s.calidad}, muestra ${s.muestra ?? 'sin muestra'})`));
  }
  return L.join('\n');
}

export interface PublicosArmados {
  publicos: Audience[];
  /** Lo que el código le tiró al modelo y por qué. Va al reporte, no se calla. */
  descartes: string[];
}

export async function armarPublicos(
  project: Project,
  ficha: ProjectBrief | null,
  senales: MarketSignal[],
): Promise<PublicosArmados> {
  const descartes: string[] = [];

  const usuario = [
    contextoDeFicha(ficha),
    '',
    contextoDeRadar(senales),
    '',
    senalesEnTexto(senales),
    '',
    'LAS ETAPAS Y QUÉ SIGNIFICAN:',
    ...ETAPAS.map((e) => `- ${e}: ${ETAPA_EXPLICACION[e]}`),
  ].join('\n');

  let propuestas: PropuestaPublico[] = [];
  try {
    const r = await chatJSON<{ publicos?: PropuestaPublico[] }>(
      [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: usuario },
      ],
      { temperature: 0.4, maxTokens: 2200 },
    );
    propuestas = r.publicos ?? [];
  } catch (e) {
    descartes.push(`el modelo no contestó: ${e instanceof Error ? e.message : String(e)}`);
    return { publicos: [], descartes };
  }

  // El conjunto de ids que EXISTEN de verdad. Todo lo demás es invención.
  const idsReales = new Set(senales.map((s) => s.id));
  const filas: NewAudience[] = [];
  const ofertasVistas = new Set<string>();

  for (const p of propuestas) {
    const nombre = texto(p.nombre, 120);
    const etapa = ETAPAS.includes(p.etapa as EtapaPublico) ? (p.etapa as EtapaPublico) : null;

    // Los ids que el modelo escribió dentro de la prosa se sacan del texto y se
    // guardan como evidencia. Lo que se le enseña a un comprador no lleva UUIDs.
    const idsEnProsa: string[] = [];
    const limpiar = (v: unknown, max: number): string | null => {
      const t = texto(v, max);
      if (!t) return null;
      const r = limpiarCitas(t, idsReales);
      idsEnProsa.push(...r.ids);
      if (r.inventados.length) {
        descartes.push(`"${nombre ?? '(sin nombre)'}": se tiró de la prosa ${r.inventados.length} id(s) citado(s) que no existen`);
      }
      return r.texto || null;
    };

    const segmento = limpiar(p.segmento, 400);
    const dolor = limpiar(p.dolor, 400);
    const oferta = limpiar(p.oferta, 400);
    const porque = limpiar(p.porque, 900);

    if (!nombre || !segmento || !dolor || !oferta || !etapa) {
      descartes.push(`público incompleto descartado: ${JSON.stringify(p).slice(0, 140)}`);
      continue;
    }
    if (!porque) {
      // Sin argumento no entra. Es el candado 1 y la base también lo impone.
      descartes.push(`"${nombre}" descartado: vino sin porqué, y un público sin argumento es una suposición`);
      continue;
    }

    // Misma oferta = mismo público. Se queda el primero.
    const claveOferta = oferta.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (ofertasVistas.has(claveOferta)) {
      descartes.push(`"${nombre}" descartado: repite la oferta de otro público ("${oferta.slice(0, 60)}")`);
      continue;
    }
    ofertasVistas.add(claveOferta);

    // Candado 2: la evidencia se comprueba contra las señales reales. Se juntan
    // los ids del campo `evidencia` y los que venían escritos en la prosa.
    const evidencia: string[] = [];
    for (const id of [...(p.evidencia ?? []), ...idsEnProsa]) {
      if (typeof id !== 'string') continue;
      if (evidencia.includes(id)) continue;
      if (idsReales.has(id)) evidencia.push(id);
      else descartes.push(`"${nombre}": se tiró un id de evidencia que no existe (${String(id).slice(0, 40)})`);
    }

    // El tamaño solo pasa si su señal existe. Lo exige también un CHECK de la base.
    let tamanoEstimado: number | null = null;
    let tamanoSenalId: string | null = null;
    if (typeof p.tamano_estimado === 'number' && Number.isFinite(p.tamano_estimado) && p.tamano_estimado > 0) {
      if (p.tamano_senal && idsReales.has(p.tamano_senal)) {
        tamanoEstimado = Math.round(p.tamano_estimado);
        tamanoSenalId = p.tamano_senal;
      } else {
        descartes.push(`"${nombre}": se tiró el tamaño estimado (${p.tamano_estimado}) porque no trae una señal real que lo respalde`);
      }
    }

    filas.push({
      orgId: project.orgId,
      projectId: project.id,
      nombre,
      segmento,
      dolor,
      oferta,
      etapa,
      porque,
      evidencia,
      tamanoEstimado,
      tamanoSenalId,
      prioridad: typeof p.prioridad === 'number' ? Math.max(1, Math.min(9, Math.round(p.prioridad))) : filas.length + 1,
    });
    if (filas.length >= 5) break;
  }

  if (!filas.length) return { publicos: [], descartes };

  // Se reemplazan los propuestos anteriores: volver a armar es volver a armar, no
  // acumular. Los aprobados por un humano se respetan.
  await db.delete(audiences).where(and(
    eq(audiences.projectId, project.id),
    eq(audiences.estado, 'propuesto'),
  ));

  const guardados = await db.insert(audiences).values(filas).returning();

  const etapasCubiertas = new Set(guardados.map((g) => g.etapa));
  if (etapasCubiertas.size === 1) {
    descartes.push(`OJO: los ${guardados.length} públicos quedaron en la misma etapa (${[...etapasCubiertas][0]}). Probablemente es un solo público mal partido.`);
  }

  return { publicos: guardados, descartes };
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

const UUID = /\(?\s*(?:id\s*=\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\)?/gi;

/**
 * Saca los ids de señal que el modelo escribió DENTRO de la prosa.
 *
 * Medido el 30-sep en zz-Momentum: el modelo metió ids crudos en tres campos, uno
 * de ellos en la `oferta` —"ajustado al rango medio de 250 USD
 * (id=520ac5f5-040f-4a86-bffd-3ab422abb1fb)"—. Esa oferta se le enseña a un
 * comprador; un UUID ahí se ve como un error del sistema y tira la confianza que
 * todo el motor viene a construir.
 *
 * La intención del modelo era buena: está citando su fuente, que es justo lo que
 * se le pidió. El error es el lugar. Así que el id no se borra: se MUEVE a
 * `evidencia`, donde la pantalla lo sabe pintar como fuente. Si el id no existe,
 * se tira igual que cualquier cita inventada.
 */
export function limpiarCitas(t: string, idsReales: Set<string>): { texto: string; ids: string[]; inventados: string[] } {
  const ids: string[] = [];
  const inventados: string[] = [];
  const limpio = t.replace(UUID, (_todo, id: string) => {
    if (idsReales.has(id)) ids.push(id);
    else inventados.push(id);
    return '';
  });
  return {
    // Al quitar "(id=...)" quedan espacios dobles y espacios antes del punto.
    texto: limpio.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:)])/g, '$1').replace(/\(\s*\)/g, '').trim(),
    ids,
    inventados,
  };
}

export async function publicosDe(orgId: string, projectId: string): Promise<Audience[]> {
  return db
    .select()
    .from(audiences)
    .where(and(eq(audiences.orgId, orgId), eq(audiences.projectId, projectId)))
    .orderBy(audiences.prioridad, desc(audiences.createdAt));
}

/** El contexto de públicos para las etapas de abajo (plan, piezas). */
export function contextoDePublicos(ps: Audience[]): string {
  if (!ps.length) return 'Todavía no hay públicos definidos para este proyecto.';
  const L = ['LOS PÚBLICOS DE ESTE PROYECTO:'];
  for (const p of ps) {
    L.push(`- ${p.nombre} [${ETAPA_LABEL[p.etapa]}] · id=${p.id}`);
    L.push(`  quién: ${p.segmento}`);
    L.push(`  le duele: ${p.dolor}`);
    L.push(`  se le ofrece: ${p.oferta}`);
    L.push(`  por qué: ${p.porque}`);
    if (!p.evidencia.length) L.push('  OJO: no hay medición que lo sostenga, es propuesta del analista.');
  }
  return L.join('\n');
}

export async function borrarPublicos(projectIds: string[]): Promise<void> {
  if (!projectIds.length) return;
  await db.delete(audiences).where(inArray(audiences.projectId, projectIds));
}
