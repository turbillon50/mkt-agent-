/**
 * El plan: red ↔ público ↔ objetivo ↔ métrica, y la hipótesis con la que nace
 * cada publicación.
 *
 * Aquí se ve más claro que en ningún otro lado el reparto del principio 4: **el
 * modelo propone y el código calcula.** El modelo decide qué público va en qué red
 * y con qué ángulo —eso es criterio—; el código pone la métrica, la frecuencia y
 * las reglas de la red, porque eso es cuenta y consulta, y un modelo que inventa
 * un límite de caracteres con nombre creíble hace más daño que uno que se calla.
 *
 * Las reglas por red NO se reescriben aquí: salen de `SOCIAL_PLAYBOOKS` y de
 * `FORMATOS`, que ya viven en el repo con su URL oficial y su fecha de lectura.
 * `cifraDeSpec` las convierte en cifras citables — es lo que reemplazó a la lista
 * de excepciones que tenía el arnés de procedencia.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  channelPlan,
  postHypotheses,
  type Audience,
  type ChannelPlan,
  type MarketSignal,
  type NewChannelPlan,
  type NewPostHypothesis,
  type ObjetivoPlan,
  type PostHypothesis,
  type Project,
  type ProjectBrief,
} from '../db/schema';
import { chatJSON } from '../openrouter';
import { elegirFormato, RED_LABEL, type RedSlug } from '../creative/specs';
import { SOCIAL_PLAYBOOKS, esRedPublicable, type RedPublicable } from '../creative/social-playbooks';
import { contextoDeFicha } from './ficha';
import { contextoDeRadar } from './radar';
import { contextoDePublicos, ETAPA_LABEL } from './publicos';
import type { Cifra } from './procedencia';

/* ---------------------------------------------------------------------------
   La métrica la pone el CÓDIGO, no el modelo.

   Cada objetivo tiene una sola métrica que lo prueba. Si el objetivo es que la
   gente te descubra, la métrica es alcance; si es que te compre, son
   conversaciones. Dejar que el modelo elija la métrica es dejar que elija la que
   va a poder presumir después.
--------------------------------------------------------------------------- */
export const METRICA_DE_OBJETIVO: Record<ObjetivoPlan, { metrica: string; unidad: string; porque: string }> = {
  descubrimiento: {
    metrica: 'personas alcanzadas que no te seguían',
    unidad: 'personas',
    porque: 'si el objetivo es que te descubran, los seguidores actuales no cuentan como descubrimiento',
  },
  consideracion: {
    metrica: 'guardados y compartidos',
    unidad: 'acciones',
    porque: 'quien está comparando guarda para volver; los likes no distinguen entre gustar y servir',
  },
  conversion: {
    metrica: 'conversaciones iniciadas',
    unidad: 'conversaciones',
    porque: 'es lo último que se puede medir en la red antes de que el CRM tome el relevo, y se cruza con sales_leads',
  },
  retencion: {
    metrica: 'respuestas de gente que ya te compró',
    unidad: 'respuestas',
    porque: 'la retención no se ve en alcance; se ve en que el que ya te compró te vuelve a contestar',
  },
};

/** La etapa del público manda el objetivo. Esto es criterio de la casa, explícito. */
export const OBJETIVO_DE_ETAPA: Record<Audience['etapa'], ObjetivoPlan> = {
  descubre: 'descubrimiento',
  compara: 'consideracion',
  compra: 'conversion',
  ya_te_busco: 'retencion',
};

/**
 * Una regla de red, convertida en cifra citable.
 *
 * Esto es lo que el arnés de `procedencia.ts` prometió cuando se quitó la lista de
 * excepciones: un número de plataforma no es una excepción a la regla de la
 * procedencia, es una cifra con una fuente MUY buena —la spec oficial, con su URL
 * y la fecha en que se leyó.
 */
export function cifraDeSpec(red: RedPublicable, que: 'caracteres' | 'hashtags'): Cifra {
  const p = SOCIAL_PLAYBOOKS[red];
  const valor = que === 'caracteres' ? p.caracteresMax : p.hashtagsMax;
  return {
    valor,
    unidad: que === 'caracteres' ? 'caracteres' : 'hashtags',
    fuenteTipo: 'oficial',
    fuenteNombre: `documentación oficial de ${RED_LABEL[red]}`,
    fuenteUrl: p.fuente,
    medidoEn: new Date(`${p.version}T00:00:00Z`),
    metodo: `límite publicado por la plataforma, leído el ${p.version} (src/creative/social-playbooks.ts)`,
  };
}

/** El lienzo que le toca a una red, con su fuente. Para la pantalla del estudio. */
export function cifraDeLienzo(red: RedSlug): Cifra {
  const f = elegirFormato(red);
  return {
    valor: `${f.ancho}x${f.alto} (${f.ratio})`,
    fuenteTipo: 'oficial',
    fuenteNombre: `especificación oficial de ${f.label}`,
    fuenteUrl: f.fuente,
    medidoEn: new Date(`${f.leidoEl}T00:00:00Z`),
    metodo: `medidas publicadas por la plataforma, leídas el ${f.leidoEl} (src/creative/specs.ts)`,
  };
}

/* ---------------------------------------------------------------------------
   El plan.
--------------------------------------------------------------------------- */

interface PropuestaPlan {
  red?: string;
  publico_id?: string;
  formato?: string;
  frecuencia_semanal?: number;
  porque?: string;
  evidencia?: string[];
}

const SISTEMA_PLAN = [
  'Eres el estratega que decide en qué RED le habla el negocio a cada público, y por qué.',
  '',
  'Te doy la ficha del negocio, lo que se midió del mercado, sus públicos y las redes disponibles',
  'con sus reglas oficiales. Devuelve el plan: qué público va en qué red.',
  '',
  'Por cada renglón:',
  '- red: una de las redes que te doy. Solo esas.',
  '- publico_id: el id EXACTO de uno de los públicos que te di.',
  '- formato: el formato de esa red que te propongo o uno de los que trae la red.',
  '- frecuencia_semanal: cuántas veces por semana. Realista, no aspiracional.',
  '- porque: POR QUÉ ese público en esa red. Obligatorio y concreto.',
  '  Mal: "LinkedIn es bueno para B2B". Bien: "este público decide en horario de oficina y',
  '  compara proveedores; en LinkedIn puede ver cómo trabajamos antes de pedir cotización".',
  '- evidencia: ids EXACTOS de señales de mercado que lo sostengan. Si no hay, lista vacía.',
  '',
  'Reglas que no puedes romper:',
  '1. NO pongas todos los públicos en todas las redes. Un plan que dice "todo en todas" no es',
  '   un plan. Elige: máximo 2 redes por público, y justifica cada una.',
  '2. Si una red no le sirve a NINGÚN público de este negocio, NO la incluyas. Dejarla fuera',
  '   con criterio vale más que llenar el calendario.',
  '3. NO inventes límites ni medidas de las redes: de eso se encarga el sistema.',
  '4. NO inventes ids de público ni de señal.',
  '5. Español de México, claro, sin jerga.',
  '',
  'Contesta SOLO JSON: {"plan":[{"red":"instagram","publico_id":"","formato":"","frecuencia_semanal":2,"porque":"","evidencia":[]}]}',
].join('\n');

function redesEnTexto(redes: RedPublicable[]): string {
  const L = ['LAS REDES DISPONIBLES Y SUS REGLAS OFICIALES (no las cambies ni inventes otras):'];
  for (const r of redes) {
    const p = SOCIAL_PLAYBOOKS[r];
    const f = elegirFormato(r);
    L.push(`- ${r} (${RED_LABEL[r]})`);
    L.push(`  para qué sirve: ${p.objetivo}`);
    L.push(`  cómo se escribe: ${p.estructuraCopy}`);
    L.push(`  tono: ${p.tono}`);
    L.push(`  lienzo sugerido: ${f.label} ${f.ratio}`);
  }
  return L.join('\n');
}

export interface PlanArmado {
  plan: ChannelPlan[];
  descartes: string[];
}

export async function armarPlan(
  project: Project,
  ficha: ProjectBrief | null,
  senales: MarketSignal[],
  publicos: Audience[],
): Promise<PlanArmado> {
  const descartes: string[] = [];
  if (!publicos.length) return { plan: [], descartes: ['no hay públicos: el plan no se puede armar sin saber a quién se le habla'] };

  // Las redes que el proyecto puede usar. Por ahora, las publicables del repo.
  const redes = (Object.keys(SOCIAL_PLAYBOOKS) as RedPublicable[]).filter(esRedPublicable);

  const usuario = [
    contextoDeFicha(ficha),
    '',
    contextoDeRadar(senales),
    '',
    contextoDePublicos(publicos),
    '',
    redesEnTexto(redes),
  ].join('\n');

  let propuestas: PropuestaPlan[] = [];
  try {
    const r = await chatJSON<{ plan?: PropuestaPlan[] }>(
      [
        { role: 'system', content: SISTEMA_PLAN },
        { role: 'user', content: usuario },
      ],
      { temperature: 0.4, maxTokens: 2600 },
    );
    propuestas = r.plan ?? [];
  } catch (e) {
    descartes.push(`el modelo no contestó: ${e instanceof Error ? e.message : String(e)}`);
    return { plan: [], descartes };
  }

  const idsPublico = new Map(publicos.map((p) => [p.id, p]));
  const idsSenal = new Set(senales.map((s) => s.id));
  const filas: NewChannelPlan[] = [];
  const porPublico = new Map<string, number>();

  for (const p of propuestas) {
    const red = typeof p.red === 'string' ? p.red.trim().toLowerCase() : '';
    if (!esRedPublicable(red)) {
      descartes.push(`se tiró un renglón con una red que no existe o no es publicable: "${String(p.red).slice(0, 40)}"`);
      continue;
    }
    const publico = p.publico_id ? idsPublico.get(p.publico_id) : undefined;
    if (!publico) {
      descartes.push(`se tiró un renglón de ${red}: el id de público no existe (${String(p.publico_id).slice(0, 40)})`);
      continue;
    }
    const porque = typeof p.porque === 'string' ? p.porque.trim().slice(0, 900) : '';
    if (!porque) {
      descartes.push(`se tiró ${red} × "${publico.nombre}": vino sin porqué`);
      continue;
    }

    // Máximo 2 redes por público. Un plan que dice "todo en todas" no es un plan.
    const yaTiene = porPublico.get(publico.id) ?? 0;
    if (yaTiene >= 2) {
      descartes.push(`se tiró ${red} × "${publico.nombre}": ese público ya tiene 2 redes, y repartir en más es no elegir`);
      continue;
    }
    porPublico.set(publico.id, yaTiene + 1);

    // El objetivo y la métrica los pone el CÓDIGO, desde la etapa del público.
    const objetivo = OBJETIVO_DE_ETAPA[publico.etapa];
    const m = METRICA_DE_OBJETIVO[objetivo];

    const evidencia = (p.evidencia ?? []).filter((id): id is string => typeof id === 'string' && idsSenal.has(id));
    const tirados = (p.evidencia ?? []).length - evidencia.length;
    if (tirados > 0) descartes.push(`${red} × "${publico.nombre}": se tiraron ${tirados} id(s) de evidencia que no existen`);

    const playbook = SOCIAL_PLAYBOOKS[red];
    const formato = elegirFormato(red, typeof p.formato === 'string' ? p.formato : playbook.formatoPista);

    filas.push({
      orgId: project.orgId,
      projectId: project.id,
      red,
      audienceId: publico.id,
      objetivo,
      metrica: m.metrica,
      metaUnidad: m.unidad,
      formato: formato.id,
      frecuenciaSemanal: frecuenciaLimpia(p.frecuencia_semanal),
      porque,
      evidencia,
      // Qué reglas se aplicaron, para que la pantalla pueda citarlas.
      reglasAplicadas: [
        `playbook:${red}@${playbook.version}`,
        `formato:${formato.id}@${formato.leidoEl}`,
        `metrica:${objetivo}`,
      ],
    });
  }

  if (!filas.length) return { plan: [], descartes };

  await db.delete(channelPlan).where(and(
    eq(channelPlan.projectId, project.id),
    eq(channelPlan.estado, 'propuesto'),
  ));

  const guardados = await db.insert(channelPlan).values(filas).returning();

  const redesUsadas = new Set(guardados.map((g) => g.red));
  if (redesUsadas.size === 1 && publicos.length > 1) {
    descartes.push(`OJO: todo el plan quedó en una sola red (${[...redesUsadas][0]}) para ${publicos.length} públicos distintos. Revisar si es criterio o pereza.`);
  }

  return { plan: guardados, descartes };
}

function frecuenciaLimpia(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  // Más de una al día por red es ruido, no plan.
  return String(Math.min(7, Math.round(v * 10) / 10));
}

/* ---------------------------------------------------------------------------
   Las hipótesis. Cada publicación nace con la suya (principio 5).

   La hipótesis se crea ANTES de publicar, no después. Una "hipótesis" escrita
   cuando ya se conoce el resultado no es una hipótesis: es una explicación.
--------------------------------------------------------------------------- */

export interface HipotesisNueva {
  planId: string;
  hipotesis: string;
  metaValor?: number | null;
  postId?: string | null;
  pieceId?: string | null;
}

export async function crearHipotesis(project: Project, input: HipotesisNueva): Promise<PostHypothesis | null> {
  const [fila] = await db.select().from(channelPlan).where(and(
    eq(channelPlan.id, input.planId),
    eq(channelPlan.projectId, project.id),
  )).limit(1);
  if (!fila) return null;

  const valores: NewPostHypothesis = {
    orgId: project.orgId,
    projectId: project.id,
    planId: fila.id,
    audienceId: fila.audienceId,
    red: fila.red,
    hipotesis: input.hipotesis.trim().slice(0, 1200),
    // La métrica se HEREDA del plan: si cada publicación eligiera la suya, no se
    // podrían comparar entre ellas ni contra la meta del plan.
    metrica: fila.metrica,
    metaValor: input.metaValor != null ? String(input.metaValor) : fila.metaValor,
    metaUnidad: fila.metaUnidad,
    postId: input.postId ?? null,
    pieceId: input.pieceId ?? null,
    veredicto: 'pendiente',
  };
  const [h] = await db.insert(postHypotheses).values(valores).returning();
  return h ?? null;
}

/**
 * Propone la hipótesis de cada renglón del plan, en palabras del negocio.
 *
 * No la inventa de cero: la arma con el público, la etapa y el objetivo que ya
 * decidió el código, para que la hipótesis sea comprobable y no un deseo.
 */
export function hipotesisSugerida(fila: ChannelPlan, publico: Audience | undefined): string {
  const m = METRICA_DE_OBJETIVO[fila.objetivo];
  const etapa = publico ? ETAPA_LABEL[publico.etapa] : '';

  // Si el modelo bautizó al público con el nombre de su propia etapa ("Listo para
  // comprar"), repetir la etiqueta sale como "Listo para comprar (Listo para
  // comprar)". Medido el 30-sep en zz-Miami.
  const quien = !publico
    ? 'este público'
    : normalizar(publico.nombre) === normalizar(etapa)
      ? publico.nombre
      : `${publico.nombre} (${etapa})`;

  // Y el dolor y la oferta vienen como oraciones terminadas en punto. Encajarlas
  // sin quitarles el punto partía la frase en dos: "...de último minuto.
  // ofreciéndole asesoría...". Se les quita la puntuación final antes de coserlas.
  const dolor = publico?.dolor ? ` que hoy sufre ${fragmento(publico.dolor)}` : '';
  const oferta = fragmento(publico?.oferta ?? 'lo que vendemos');

  return (
    `Si en ${RED_LABEL[fila.red as RedSlug] ?? fila.red} le hablamos a ${quien}${dolor}, ` +
    `ofreciéndole ${oferta}, ` +
    `entonces sube ${m.metrica}, porque ${m.porque}.`
  );
}

/** Deja un texto listo para ir EN MEDIO de una frase: sin mayúscula ni punto final. */
function fragmento(s: string): string {
  const t = s.trim().replace(/[.;,:\s]+$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export async function planDe(orgId: string, projectId: string): Promise<ChannelPlan[]> {
  return db
    .select()
    .from(channelPlan)
    .where(and(eq(channelPlan.orgId, orgId), eq(channelPlan.projectId, projectId)))
    .orderBy(channelPlan.red, desc(channelPlan.createdAt));
}

export async function hipotesisDe(orgId: string, projectId: string): Promise<PostHypothesis[]> {
  return db
    .select()
    .from(postHypotheses)
    .where(and(eq(postHypotheses.orgId, orgId), eq(postHypotheses.projectId, projectId)))
    .orderBy(desc(postHypotheses.createdAt));
}

export async function borrarPlan(projectIds: string[]): Promise<void> {
  if (!projectIds.length) return;
  await db.delete(postHypotheses).where(inArray(postHypotheses.projectId, projectIds));
  await db.delete(channelPlan).where(inArray(channelPlan.projectId, projectIds));
}
