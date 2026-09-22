/**
 * Cuánto llevas publicado hoy, y cuánto te queda.
 *
 * La pregunta que contesta: "¿puedo publicar esto AHORA sin que la red me lo
 * rebote ni me marque como spam?". Son dos preguntas de verdad:
 *
 *   1. **el tope de la red** — Instagram acepta 50 al día por cuenta, TikTok
 *      unas 15, YouTube 100 subidas por proyecto. Esos números están en
 *      `reglas.ts` con su página oficial. Pasarse es un error de la API.
 *   2. **el ritmo** — tres publicaciones en diez minutos no rompen ningún tope
 *      y aun así se parecen a lo que las cuatro redes llaman spam con sus
 *      propias palabras. Esa parte es criterio de la casa, y se dice que lo es.
 *
 * Y la honestidad de siempre: **donde la red no publica un número, aquí no hay
 * número**. LinkedIn escribe "Standard rate limits are not published in
 * documentation"; entonces Goossip enseña lo que lleva hoy y punto. "Te quedan
 * 23 publicaciones" sonaría mejor y sería inventado.
 *
 * De dónde salen las cuentas: de la tabla `posts`, que es lo que de verdad
 * SALIÓ. Una pieza aprobada no gasta cuota; una publicada, sí.
 */
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { posts } from '../db/schema';
import {
  ESPACIADO_SUGERIDO_MIN,
  LIMITES,
  reglaPorId,
  type LimiteDePublicacion,
} from './reglas';
import { RED_LABEL, type RedSlug } from './specs';

export interface UsoDeHoy {
  red: RedSlug;
  redLabel: string;
  /** Publicaciones que SALIERON en las últimas 24 h. */
  hoy: number;
  /** En los últimos 7 días. */
  semana: number;
  /** El tope de la red. null = la red no lo publica. */
  tope: number | null;
  /** Cuántas quedan. null cuando no hay tope publicado. */
  quedan: number | null;
  /** ¿Ya no cabe una más? */
  agotado: boolean;
  /** Cuándo salió la última, para medir el ritmo. */
  ultima: Date | null;
  /** Minutos desde la última. null si no hay ninguna. */
  minutosDesdeLaUltima: number | null;
  /** Lo que la casa sugiere esperar. NO es regla de la red. */
  espaciadoSugeridoMin: number;
  /** Va muy seguido para el criterio de la casa. */
  muySeguido: boolean;
  limite: LimiteDePublicacion;
  /** La frase que se enseña en la Sala. */
  aviso: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export async function usoDeHoy(input: {
  orgId: string;
  projectId: string;
  red: RedSlug;
  ahora?: Date;
}): Promise<UsoDeHoy> {
  const ahora = input.ahora ?? new Date();
  const desdeDia = new Date(ahora.getTime() - DIA_MS);
  const desdeSemana = new Date(ahora.getTime() - 7 * DIA_MS);

  const base = and(
    eq(posts.orgId, input.orgId),
    eq(posts.projectId, input.projectId),
    eq(posts.platform, input.red),
  );

  const [dia, semana, ultimas] = await Promise.all([
    db.select({ n: count() }).from(posts).where(and(base, gte(posts.createdAt, desdeDia))),
    db.select({ n: count() }).from(posts).where(and(base, gte(posts.createdAt, desdeSemana))),
    db
      .select({ createdAt: posts.createdAt, publishedAt: posts.publishedAt })
      .from(posts)
      .where(base)
      .orderBy(desc(posts.createdAt))
      .limit(1),
  ]);

  const hoy = Number(dia[0]?.n ?? 0);
  const limite = LIMITES[input.red];
  const tope = limite.porDia;
  const quedan = tope === null ? null : Math.max(0, tope - hoy);
  const ultima = ultimas[0]?.publishedAt ?? ultimas[0]?.createdAt ?? null;
  const minutos = ultima ? Math.floor((ahora.getTime() - ultima.getTime()) / 60_000) : null;
  const espaciado = ESPACIADO_SUGERIDO_MIN[input.red];

  return {
    red: input.red,
    redLabel: RED_LABEL[input.red],
    hoy,
    semana: Number(semana[0]?.n ?? 0),
    tope,
    quedan,
    agotado: quedan !== null && quedan <= 0,
    ultima,
    minutosDesdeLaUltima: minutos,
    espaciadoSugeridoMin: espaciado,
    muySeguido: minutos !== null && espaciado > 0 && minutos < espaciado,
    limite,
    aviso: frase({ red: input.red, hoy, tope, quedan, minutos, espaciado, limite }),
  };
}

/**
 * La frase de la esquina de la Sala.
 *
 * Tiene tres versiones y la diferencia importa: con tope publicado se dice el
 * número; sin tope publicado se dice lo que llevas y POR QUÉ no se dice cuánto
 * queda; y agotado se dice que hoy ya no.
 */
function frase(x: {
  red: RedSlug;
  hoy: number;
  tope: number | null;
  quedan: number | null;
  minutos: number | null;
  espaciado: number;
  limite: LimiteDePublicacion;
}): string {
  const red = RED_LABEL[x.red];
  const partes: string[] = [];

  if (x.tope === null) {
    partes.push(
      `Llevas ${x.hoy} ${x.hoy === 1 ? 'publicación' : 'publicaciones'} hoy en ${red}. ${red} no publica cuántas admite al día, así que no te digo un número que me estaría inventando.`,
    );
  } else if (x.quedan !== null && x.quedan <= 0) {
    partes.push(
      `Hoy ya no cabe otra en ${red}: llevas ${x.hoy} y el tope por la API son ${x.tope} en 24 horas.`,
    );
  } else {
    partes.push(
      `Te ${x.quedan === 1 ? 'queda' : 'quedan'} ${x.quedan} ${
        x.quedan === 1 ? 'publicación' : 'publicaciones'
      } hoy en ${red} por la API (llevas ${x.hoy} de ${x.tope}).`,
    );
  }

  if (x.minutos !== null && x.espaciado > 0 && x.minutos < x.espaciado) {
    partes.push(
      `La anterior salió hace ${x.minutos} ${x.minutos === 1 ? 'minuto' : 'minutos'}. Te sugiero esperar a las ${x.espaciado / 60} horas entre publicaciones — eso no es regla de ${red}, es criterio nuestro para no parecer spam.`,
    );
  }

  return partes.join(' ');
}

/**
 * El uso de TODAS las redes del proyecto, para el panel de la Sala.
 * Una consulta por red: son ocho como mucho y van en paralelo.
 */
export async function usoDeTodas(input: {
  orgId: string;
  projectId: string;
  redes: RedSlug[];
  ahora?: Date;
}): Promise<UsoDeHoy[]> {
  return Promise.all(
    input.redes.map((red) => usoDeHoy({ ...input, red })),
  );
}

/**
 * ¿Se puede publicar ahora en esta red?
 *
 * Devuelve motivo SIEMPRE, también cuando sí: la bitácora del proyecto tiene
 * que poder contestar por qué se frenó una publicación sin que nadie lea código.
 */
export function veredictoDeFrecuencia(uso: UsoDeHoy): {
  puede: boolean;
  nivel: 'verde' | 'ambar' | 'rojo';
  motivo: string;
  regla: string | null;
  fuente: string | null;
} {
  const regla = reglaPorId(uso.limite.regla);

  if (uso.agotado) {
    return {
      puede: false,
      nivel: 'rojo',
      motivo: `${uso.redLabel} acepta ${uso.tope} publicaciones por cuenta en 24 horas y este proyecto ya lleva ${uso.hoy}. La número ${uso.hoy + 1} la rechaza la API.`,
      regla: regla?.titulo ?? null,
      fuente: regla?.fuente ?? null,
    };
  }

  if (uso.muySeguido) {
    return {
      puede: true,
      nivel: 'ambar',
      motivo: `La anterior de ${uso.redLabel} salió hace ${uso.minutosDesdeLaUltima} minutos. Criterio de la casa: dejar ${uso.espaciadoSugeridoMin} minutos entre publicaciones para no parecer spam. ${uso.redLabel} no publica un mínimo — esto lo decidimos nosotros.`,
      regla: null,
      fuente: null,
    };
  }

  return {
    puede: true,
    nivel: 'verde',
    motivo:
      uso.tope === null
        ? `${uso.redLabel} no publica un tope diario. Llevas ${uso.hoy} hoy.`
        : `Llevas ${uso.hoy} de ${uso.tope} hoy en ${uso.redLabel}.`,
    regla: regla?.titulo ?? null,
    fuente: regla?.fuente ?? null,
  };
}
