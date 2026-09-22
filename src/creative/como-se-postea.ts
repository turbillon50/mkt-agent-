/**
 * "Cómo se postea aquí" — la guía por red del panel de la Sala.
 *
 * Qué es: lo que hay que saber ANTES de escribir para esa red, en cuatro
 * bloques — cuánto escribir, qué no hacer nunca, qué te banea, y cuánto te
 * queda hoy.
 *
 * Lo que NO es, y esto es la mitad del archivo: una lista de "mejores prácticas
 * de marketing" sacadas de un blog. Todo lo que dice un número sale de
 * `cortes.ts` o de `reglas.ts`, que traen su URL oficial. Y donde no hay número
 * oficial, se dice que no lo hay.
 *
 * El caso que más duele es el de los HORARIOS. El spec pide "horarios sugeridos
 * con fuente" y la verdad medida es que **ninguna de las seis redes publica
 * horarios oficiales**: lo que circula son estudios de terceros que se
 * contradicen entre sí y cambian cada año. Así que esta guía no inventa un
 * "publica a las 7 p.m."; enseña **a qué hora publicó ESTE proyecto** y cuándo
 * le fue mejor, y si no hay datos suficientes lo dice. Un horario propio con
 * diez publicaciones detrás vale más que un promedio mundial.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { posts } from '../db/schema';
import { corteDe, type Corte } from './cortes';
import { REGLAS, reglasDe, type Regla } from './reglas';
import { formatosDe, RED_LABEL, type RedSlug } from './specs';

export interface ConsejoDeRed {
  titulo: string;
  texto: string;
  /** De dónde salió. null = criterio de la casa, y la pantalla lo dice. */
  fuente: string | null;
}

export interface GuiaDeRed {
  red: RedSlug;
  redLabel: string;
  corte: Corte;
  /** Cuánto escribir y dónde poner lo importante. */
  escribir: ConsejoDeRed[];
  /** Lo que banea. Sale de las reglas con peso 'bloquea'. */
  banean: Array<{ titulo: string; texto: string; fuente: string; leidoEl: string }>;
  /** Cuántos hashtags caben y qué se sabe de verdad de ellos. */
  hashtags: ConsejoDeRed;
  /** Horarios: los del propio proyecto, o la verdad de que no hay datos. */
  horarios: ConsejoDeRed;
  /** Los lienzos disponibles, en una línea. */
  lienzos: string;
}

/**
 * Cuántos hashtags recomienda la casa.
 *
 * El spec pide "hashtags 3-5". Ninguna red publica un número recomendado —
 * publican el TOPE (Instagram, 30) y prohíben el spam. Así que el 3-5 se
 * presenta como lo que es: criterio nuestro, con el tope oficial al lado.
 */
export const HASHTAGS_QUE_SUGIERE_LA_CASA = '3 a 5';

function consejosDeEscritura(red: RedSlug, corte: Corte): ConsejoDeRed[] {
  const out: ConsejoDeRed[] = [];

  if (corte.visible !== null && corte.visible !== corte.tope) {
    out.push({
      titulo: 'Gana la primera línea',
      texto: `${RED_LABEL[red]} enseña ${corte.visible} caracteres de ${corte.hueco} y esconde el resto detrás de "${corte.etiquetaVerMas}". Lo que quieras que lea alguien que no aprieta nada, tiene que caber ahí.${
        corte.origenVisible === 'observado'
          ? ' Ese corte no lo publica la red: es lo que hace su aplicación, medido.'
          : ''
      }`,
      fuente: corte.origenVisible === 'oficial' ? corte.fuente : null,
    });
  }

  if (corte.tope !== null) {
    out.push({
      titulo: 'El tope',
      texto:
        corte.visible === corte.tope
          ? `${corte.tope} caracteres y ni uno más: pasado ahí ${RED_LABEL[red]} no publica. Para decir más, se hace un hilo.`
          : `Caben ${corte.tope} caracteres. No los llenes por llenarlos — se publican, pero nadie los lee.`,
      fuente: corte.origenTope === 'oficial' ? corte.fuente : null,
    });
  }

  out.push({
    titulo: 'La llamada a la acción',
    texto:
      red === 'youtube'
        ? 'La miniatura y el título hacen el clic; la llamada a la acción va en los primeros renglones de la descripción, que es lo único que se ve sin abrirla.'
        : red === 'twitter'
          ? 'Con 280 caracteres, la llamada a la acción y el enlace compiten con el mensaje. Un enlace acortado además huele mal: pon la dirección completa.'
          : `Una sola, al final y en imperativo: "Agenda tu visita", "Escríbenos". Dos llamadas a la acción en la misma pieza no dan el doble de clics, dan la mitad.`,
    fuente: null,
  });

  return out;
}

function consejoDeHashtags(red: RedSlug): ConsejoDeRed {
  const tope = formatosDe(red).find((f) => f.limites?.hashtags)?.limites?.hashtags ?? null;
  const partes: string[] = [];
  if (tope) {
    partes.push(
      `${RED_LABEL[red]} acepta hasta ${tope} hashtags y de más rechaza la publicación entera.`,
    );
  }
  partes.push(
    `Nosotros sugerimos ${HASHTAGS_QUE_SUGIERE_LA_CASA}, y que tengan que ver con lo que dice la pieza. Eso es criterio nuestro, no regla de la red.`,
  );
  partes.push(
    'Y una cosa que conviene saber: **ninguna red publica su lista de hashtags bloqueados.** Ni Instagram ni TikTok. Quien te enseñe una la sacó de un blog. Lo que sí está escrito en sus políticas es que repetir el mismo bloque de hashtags en cada publicación es spam — eso sí lo revisamos.',
  );
  return {
    titulo: 'Hashtags',
    texto: partes.join(' '),
    fuente: tope
      ? formatosDe(red).find((f) => f.limites?.hashtags)?.fuente ?? null
      : null,
  };
}

/**
 * Los horarios, con los datos del propio proyecto.
 *
 * Se cuentan las publicaciones por hora del día. Con menos de seis no se dice
 * nada: tres publicaciones no son un patrón, son tres publicaciones.
 */
async function consejoDeHorarios(input: {
  orgId: string;
  projectId: string;
  red: RedSlug;
}): Promise<ConsejoDeRed> {
  const MINIMO_PARA_OPINAR = 6;
  const base =
    'Ninguna de las redes publica horarios oficiales para publicar; lo que circula por ahí son estudios de terceros que se contradicen. Así que aquí no te invento uno: te enseño el tuyo.';

  const filas = await db
    .select({
      hora: sql<number>`extract(hour from coalesce(${posts.publishedAt}, ${posts.createdAt}))`,
      n: sql<number>`count(*)`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.orgId, input.orgId),
        eq(posts.projectId, input.projectId),
        eq(posts.platform, input.red),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(3)
    .catch(() => []);

  const total = filas.reduce((n, f) => n + Number(f.n), 0);
  if (total < MINIMO_PARA_OPINAR) {
    return {
      titulo: 'Horarios',
      texto: `${base} Todavía no hay suficientes publicaciones de este proyecto en ${RED_LABEL[input.red]} (${total}) para que el dato signifique algo. A partir de ${MINIMO_PARA_OPINAR} te digo a qué horas sueles publicar.`,
      fuente: null,
    };
  }

  const horas = filas
    .map((f) => `${String(Number(f.hora)).padStart(2, '0')}:00 (${f.n})`)
    .join(', ');
  return {
    titulo: 'Horarios',
    texto: `${base} Este proyecto publica en ${RED_LABEL[input.red]} sobre todo a las ${horas}. Son tus datos, de ${total} publicaciones.`,
    fuente: null,
  };
}

/** Lo que banea: las reglas de peso 'bloquea' de esa red y de México. */
function loQueBanea(red: RedSlug): GuiaDeRed['banean'] {
  return reglasDe(red)
    .filter((r: Regla) => r.peso === 'bloquea')
    .map((r) => ({
      titulo: r.titulo,
      texto: r.paraGoossip,
      fuente: r.fuente,
      leidoEl: r.leidoEl,
    }));
}

export async function guiaDeRed(input: {
  orgId: string;
  projectId: string;
  red: RedSlug;
}): Promise<GuiaDeRed> {
  const corte = corteDe(input.red);
  return {
    red: input.red,
    redLabel: RED_LABEL[input.red],
    corte,
    escribir: consejosDeEscritura(input.red, corte),
    banean: loQueBanea(input.red),
    hashtags: consejoDeHashtags(input.red),
    horarios: await consejoDeHorarios(input),
    lienzos: formatosDe(input.red)
      .map((f) => `${f.label.replace(/^[^—]+— /, '')} ${f.ancho}×${f.alto}`)
      .join(' · '),
  };
}

/** Cuántas reglas de bloqueo hay por red. Para la entrega y para /admin. */
export function cuantasBloquean(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of REGLAS) {
    if (r.peso !== 'bloquea') continue;
    out[r.ambito] = (out[r.ambito] ?? 0) + 1;
  }
  return out;
}
