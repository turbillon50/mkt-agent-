/**
 * El visor por red: cómo se va a ver la pieza ANTES de publicarla.
 *
 * Esta parte es la que se puede medir y probar, así que vive aquí y no dentro
 * del componente: el recorte del texto, los avisos y la lista de formatos por
 * red son reglas, no pixeles. El componente (`components/contenido/preview-red`)
 * solo las pinta.
 *
 * Todo sale de dos archivos y de ningún otro lado:
 *   · `specs.ts` — las medidas OFICIALES, con su URL y su fecha.
 *   · `cortes.ts` — dónde corta el "ver más" cada red, marcando cuáles números
 *     son oficiales y cuáles son comportamiento observado de la aplicación.
 *
 * Aquí no se escribe ni un número a mano. El día que Instagram cambie su
 * límite, se corrige en un solo lugar y el visor se entera solo.
 */
import { corteDe, partirDondeCorta, type Corte } from './cortes';
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
  corte: Corte;
  /** Lo que la gente ve sin apretar "ver más". */
  visible: string;
  /** Lo que queda escondido detrás del "ver más". Vacío si cabe todo. */
  oculto: string;
  cortado: boolean;
  /** Lo que la red NO va a aceptar porque se pasa del tope. */
  sobrante: string;
  seExcede: boolean;
  caracteres: number;
  /** Dónde esconde. */
  limite: number | null;
  /** Dónde rechaza. */
  tope: number | null;
  hashtags: string[];
  menciones: string[];
  avisos: Aviso[];
  zonaSegura: { arriba: number; abajo: number; lados: number };
}

const RE_HASHTAG = /#[\p{L}\p{N}_]+/gu;
const RE_MENCION = /@[\p{L}\p{N}_.]+/gu;

/**
 * El corte del "ver más" y el tope de la red, que son DOS cosas.
 *
 * Pasado el corte, el texto sigue ahí y nadie lo lee: es un `aviso`. Pasado el
 * tope, la red rechaza la publicación entera: es un `error`. Tratarlos igual
 * era el bug de la corrida 7 — un texto de 3000 caracteres en Instagram salía
 * marcado igual que uno de 400 en X, y solo uno de los dos no se publica.
 */
export function vistaPrevia(input: {
  red: RedSlug;
  formatoId?: string | null;
  texto: string;
}): VistaPrevia {
  const formato =
    (input.formatoId ? formatoPorId(input.formatoId) : null) ??
    formatosDe(input.red)[0] ??
    FORMATOS[0]!;

  const texto = input.texto ?? '';
  const corte = corteDe(formato.red);

  // El corte del hueco manda sobre el de la red cuando el formato tiene uno
  // propio y más chico: el título de un YouTube Short y el pie de un carrusel
  // de Facebook no se cortan donde se corta el muro.
  const limite =
    formato.limites?.texto !== undefined
      ? Math.min(formato.limites.texto, corte.visible ?? formato.limites.texto)
      : corte.visible;
  const tope = corte.tope;

  const partido = partirDondeCorta(texto, limite);
  const seExcede = tope !== null && texto.length > tope;

  const hashtags = [...new Set(texto.match(RE_HASHTAG) ?? [])];
  const menciones = [...new Set(texto.match(RE_MENCION) ?? [])];

  const avisos: Aviso[] = [];

  if (texto.trim().length === 0) {
    avisos.push({ severidad: 'error', texto: 'La pieza no lleva texto.' });
  }

  if (seExcede) {
    avisos.push({
      severidad: corte.origenTope === 'oficial' ? 'error' : 'aviso',
      texto:
        corte.origenTope === 'oficial'
          ? `${RED_LABEL[formato.red]} acepta ${tope} caracteres en ${corte.hueco} y llevas ${texto.length}. Tal cual, NO se publica: sobran ${texto.length - tope!}.`
          : `Llevas ${texto.length} caracteres y ${RED_LABEL[formato.red]} admite del orden de ${tope} en ${corte.hueco}. Ese número no lo publica la red, así que puede variar — pero acércate.`,
    });
  } else if (partido.cortado) {
    avisos.push({
      severidad: 'aviso',
      texto: `${RED_LABEL[formato.red]} enseña los primeros ${limite} caracteres y esconde ${
        texto.length - partido.visible.length
      } detrás de "${corte.etiquetaVerMas || 'ver más'}". Pon lo que importa antes del corte.${
        corte.origenVisible === 'observado'
          ? ' (Dónde corta exactamente no lo publica la red: es lo que hace su aplicación.)'
          : ''
      }`,
    });
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
    corte,
    visible: partido.visible,
    oculto: partido.oculto,
    cortado: partido.cortado,
    sobrante: seExcede ? texto.slice(tope!) : '',
    seExcede,
    caracteres: texto.length,
    limite,
    tope,
    hashtags,
    menciones,
    avisos,
    zonaSegura: zonaSeguraPx(formato),
  };
}

// ---------------------------------------------------------------------------
// Los formatos que se ven en la Sala
// ---------------------------------------------------------------------------

/**
 * Los lienzos de la Sala de arte, agrupados por red.
 *
 * El spec pide, red por red: Facebook con imagen 1200 × 630 y 1080 × 1080,
 * carrusel y video; Instagram con muro 1:1 y 4:5, carrusel, historia y reel;
 * LinkedIn como persona y como página, más el carrusel en PDF; X con imagen
 * horizontal y cuadrada y con hilo; TikTok en 9:16; YouTube con su miniatura; y
 * la burbuja de Messenger.
 *
 * Todos salen del catálogo de specs. Si alguno no estuviera, `formatosDelVisor`
 * truena en vez de pintar un marco inventado — un visor que se inventa una
 * medida enseña una mentira que se aprueba.
 */
export const FORMATOS_DEL_VISOR = [
  // Facebook
  'facebook-enlace',
  'facebook-cuadrada',
  'facebook-feed',
  'facebook-carrusel',
  'facebook-video',
  'facebook-messenger',
  // Instagram
  'instagram-feed-11',
  'instagram-feed-45',
  'instagram-carrusel',
  'instagram-historia',
  'instagram-reel',
  // LinkedIn
  'linkedin-imagen-191',
  'linkedin-imagen-11',
  'linkedin-documento',
  // X
  'twitter-imagen-191',
  'twitter-imagen-11',
  // TikTok
  'tiktok-video',
  // YouTube
  'youtube-miniatura',
  'youtube-short',
] as const;

/** Cómo se pinta el marco. Es lo que decide el CHROME del componente. */
export type Chrome =
  | 'muro'
  | 'carrusel'
  | 'historia'
  | 'reel'
  | 'hilo'
  | 'miniatura'
  | 'documento'
  | 'burbuja';

export interface FormatoDelVisor {
  id: string;
  label: string;
  /** El nombre corto para la pestaña: "Muro", "Reel", "Historia". */
  corto: string;
  red: RedSlug;
  redLabel: string;
  chrome: Chrome;
  tipo: FormatoSpec['tipo'];
  ancho: number;
  alto: number;
  ratio: string;
  fuente: string;
  leidoEl: string;
}

const CHROME_DE: Record<string, { chrome: Chrome; corto: string }> = {
  'facebook-enlace': { chrome: 'muro', corto: 'Enlace 1200×630' },
  'facebook-cuadrada': { chrome: 'muro', corto: 'Cuadrada 1080×1080' },
  'facebook-feed': { chrome: 'muro', corto: 'Muro 4:5' },
  'facebook-carrusel': { chrome: 'carrusel', corto: 'Carrusel' },
  'facebook-video': { chrome: 'muro', corto: 'Video' },
  'facebook-messenger': { chrome: 'burbuja', corto: 'Messenger' },
  'instagram-feed-11': { chrome: 'muro', corto: 'Muro 1:1' },
  'instagram-feed-45': { chrome: 'muro', corto: 'Muro 4:5' },
  'instagram-carrusel': { chrome: 'carrusel', corto: 'Carrusel' },
  'instagram-historia': { chrome: 'historia', corto: 'Historia' },
  'instagram-reel': { chrome: 'reel', corto: 'Reel' },
  'linkedin-imagen-191': { chrome: 'muro', corto: 'Imagen 1200×628' },
  'linkedin-imagen-11': { chrome: 'muro', corto: 'Cuadrada' },
  'linkedin-documento': { chrome: 'documento', corto: 'Carrusel PDF' },
  'twitter-imagen-191': { chrome: 'hilo', corto: 'Imagen horizontal' },
  'twitter-imagen-11': { chrome: 'hilo', corto: 'Imagen cuadrada' },
  'tiktok-video': { chrome: 'reel', corto: 'Video 9:16' },
  'youtube-miniatura': { chrome: 'miniatura', corto: 'Miniatura' },
  'youtube-short': { chrome: 'reel', corto: 'Short' },
};

export function formatosDelVisor(): FormatoDelVisor[] {
  return FORMATOS_DEL_VISOR.map((id) => {
    const f = formatoPorId(id);
    if (!f) throw new Error(`El visor pide el formato ${id} y no está en las specs.`);
    const c = CHROME_DE[id] ?? { chrome: 'muro' as Chrome, corto: f.label };
    return {
      id: f.id,
      label: f.label,
      corto: c.corto,
      red: f.red,
      redLabel: RED_LABEL[f.red],
      chrome: c.chrome,
      tipo: f.tipo,
      ancho: f.ancho,
      alto: f.alto,
      ratio: f.ratio,
      fuente: f.fuente,
      leidoEl: f.leidoEl,
    };
  });
}

/**
 * Las seis redes de la Sala, en el orden en que se enseñan.
 *
 * Messenger va dentro de Facebook porque es la misma conexión y las mismas
 * políticas; se ve como un lienzo más de Facebook, no como una pestaña aparte.
 */
export const REDES_DE_LA_SALA: RedSlug[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
];

export function formatosDeLaSala(red: RedSlug): FormatoDelVisor[] {
  return formatosDelVisor().filter((f) => f.red === red);
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
    handle:
      input.red === 'twitter' || input.red === 'instagram' || input.red === 'tiktok'
        ? `@${handle}`
        : handle,
    avatar: input.logo ?? null,
    ...(input.red === 'linkedin' ? { comoPagina: (input.autorLinkedin ?? 'pagina') === 'pagina' } : {}),
  };
}
