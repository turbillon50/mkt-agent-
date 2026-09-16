/**
 * El visor por red: cómo se va a ver la pieza ANTES de publicarla.
 *
 * Esta parte es la que se puede medir y probar, así que vive aquí y no dentro
 * del componente: el recorte del texto, los avisos y la lista de formatos por
 * red son reglas, no pixeles. El componente (`components/contenido/preview-red`)
 * solo las pinta.
 *
 * Todo sale de `specs.ts`, que trae las medidas OFICIALES de cada red con su
 * fuente y su fecha. Aquí no se escribe ni un número de píxeles a mano: el día
 * que Instagram cambie su límite, se corrige en un solo lugar y el visor se
 * entera solo.
 */
import {
  FORMATOS,
  RED_LABEL,
  formatoPorId,
  formatosDe,
  zonaSeguraPx,
  type FormatoSpec,
  type RedSlug,
} from './specs';

export type Severidad = 'error' | 'aviso' | 'nota';

export interface Aviso {
  severidad: Severidad;
  texto: string;
}

export interface VistaPrevia {
  formato: FormatoSpec;
  /** Lo que la gente ve sin apretar "ver más". */
  visible: string;
  /** Lo que queda escondido detrás del "ver más". Vacío si cabe todo. */
  oculto: string;
  cortado: boolean;
  caracteres: number;
  limite: number | null;
  hashtags: string[];
  menciones: string[];
  avisos: Aviso[];
  zonaSegura: { arriba: number; abajo: number; lados: number };
}

const RE_HASHTAG = /#[\p{L}\p{N}_]+/gu;
const RE_MENCION = /@[\p{L}\p{N}_.]+/gu;

/**
 * El corte del "ver más".
 *
 * `limites.texto` de la spec es el corte de VISIBILIDAD, no el máximo que la
 * red acepta: Facebook corta el muro a 150 caracteres y el resto sigue ahí,
 * detrás de un "ver más". Por eso el aviso es "aviso" y no "error" — el texto
 * largo se publica bien, nada más que la mitad no la lee nadie.
 */
export function vistaPrevia(input: {
  red: RedSlug;
  formatoId?: string | null;
  texto: string;
}): VistaPrevia {
  const formato =
    (input.formatoId ? formatoPorId(input.formatoId) : null) ?? formatosDe(input.red)[0] ?? FORMATOS[0];

  const texto = input.texto ?? '';
  const limite = formato.limites?.texto ?? null;
  const cortado = limite !== null && texto.length > limite;

  const hashtags = [...new Set(texto.match(RE_HASHTAG) ?? [])];
  const menciones = [...new Set(texto.match(RE_MENCION) ?? [])];

  const avisos: Aviso[] = [];

  if (cortado) {
    avisos.push({
      severidad: 'aviso',
      texto: `${RED_LABEL[formato.red]} enseña los primeros ${limite} caracteres y esconde ${
        texto.length - limite!
      } detrás de "ver más". Pon lo que importa antes del corte.`,
    });
  }

  if (texto.trim().length === 0) {
    avisos.push({ severidad: 'error', texto: 'La pieza no lleva texto.' });
  }

  const topeHashtags = formato.limites?.hashtags;
  if (topeHashtags && hashtags.length > topeHashtags) {
    avisos.push({
      severidad: 'error',
      texto: `${hashtags.length} hashtags y ${RED_LABEL[formato.red]} acepta ${topeHashtags}. De más, rechaza la publicación entera.`,
    });
  }

  if (formato.red === 'instagram' && formato.tipo === 'imagen' && !formato.archivos.includes('png')) {
    avisos.push({
      severidad: 'nota',
      texto: 'La API de Instagram solo acepta JPEG. Si la pieza es PNG, se convierte al publicar.',
    });
  }

  if (formato.zonaSegura) {
    const z = zonaSeguraPx(formato);
    avisos.push({
      severidad: 'nota',
      texto: `Deja libres ${z.arriba} px arriba, ${z.abajo} px abajo y ${z.lados} px a cada lado: ahí la red encima sus botones.`,
    });
  }

  if (formato.limites?.titulo) {
    avisos.push({
      severidad: 'nota',
      texto: `El título se corta a ${formato.limites.titulo} caracteres.`,
    });
  }

  if (menciones.length > 0) {
    avisos.push({
      severidad: 'nota',
      texto: `${menciones.length} ${menciones.length === 1 ? 'mención' : 'menciones'}: ${menciones.join(
        ' ',
      )}. Revisa que existan en ${RED_LABEL[formato.red]} — una mención rota se publica como texto plano.`,
    });
  }

  return {
    formato,
    visible: cortado ? texto.slice(0, limite!) : texto,
    oculto: cortado ? texto.slice(limite!) : '',
    cortado,
    caracteres: texto.length,
    limite,
    hashtags,
    menciones,
    avisos,
    zonaSegura: zonaSeguraPx(formato),
  };
}

/**
 * Los formatos que el visor enseña para una pieza.
 *
 * El issue pide ver "una pieza en 6 formatos": Facebook, Instagram feed,
 * historia/reel, LinkedIn, X, TikTok y la miniatura de YouTube. Esta es esa
 * lista, y sale del catálogo de specs para que no haya dos verdades.
 */
export const FORMATOS_DEL_VISOR = [
  'facebook-feed',
  'instagram-feed-11',
  'instagram-feed-45',
  'instagram-historia',
  'instagram-reel',
  'linkedin-imagen-191',
  'twitter-imagen-191',
  'tiktok-video',
  'youtube-miniatura',
] as const;

export interface FormatoDelVisor {
  id: string;
  label: string;
  red: RedSlug;
  redLabel: string;
  ancho: number;
  alto: number;
  ratio: string;
  fuente: string;
  leidoEl: string;
}

export function formatosDelVisor(): FormatoDelVisor[] {
  return FORMATOS_DEL_VISOR.map((id) => {
    const f = formatoPorId(id);
    if (!f) throw new Error(`El visor pide el formato ${id} y no está en las specs.`);
    return {
      id: f.id,
      label: f.label,
      red: f.red,
      redLabel: RED_LABEL[f.red],
      ancho: f.ancho,
      alto: f.alto,
      ratio: f.ratio,
      fuente: f.fuente,
      leidoEl: f.leidoEl,
    };
  });
}

/**
 * El lunes de la semana de una fecha.
 *
 * Vive aquí y no en la ruta porque las pruebas lo tienen que poder importar sin
 * arrastrar `server-only` — y porque el error que evita es de los que se ven una
 * vez al mes: `getDay()` devuelve 0 para el domingo, así que el lunes de la
 * semana de un domingo es SEIS días atrás, no el día siguiente. Sin esto, quien
 * abre la vista Semana un domingo ve la semana que viene.
 *
 * La semana empieza en lunes, que es como se planea el contenido en México.
 */
export function lunesDe(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const desplazamiento = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - desplazamiento);
  return x;
}

/**
 * LinkedIn publica como PERSONA o como PÁGINA y el issue pide ver las dos.
 * No cambia el lienzo —los píxeles son los mismos— cambia quién firma, y eso
 * es lo que el cliente quiere revisar antes de que salga.
 */
export type AutorLinkedin = 'persona' | 'pagina';

export interface Firma {
  nombre: string;
  handle: string;
  avatar: string | null;
  /** Solo LinkedIn. */
  comoPagina?: boolean;
}

/**
 * Cómo se firma la pieza en cada red.
 *
 * Con el kit de marca cargado, el avatar es el logo del proyecto. Sin kit, se
 * devuelve null y el visor pinta la inicial: inventarle un avatar genérico a
 * la marca del cliente es enseñarle una vista previa de algo que no es suyo.
 */
export function firmaDe(input: {
  nombre: string;
  red: RedSlug;
  logo?: string | null;
  autorLinkedin?: AutorLinkedin;
}): Firma {
  const handle = input.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return {
    nombre: input.nombre,
    handle: input.red === 'twitter' || input.red === 'instagram' || input.red === 'tiktok' ? `@${handle}` : handle,
    avatar: input.logo ?? null,
    ...(input.red === 'linkedin' ? { comoPagina: (input.autorLinkedin ?? 'pagina') === 'pagina' } : {}),
  };
}
