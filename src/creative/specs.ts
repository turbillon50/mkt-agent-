/**
 * Las medidas OFICIALES de cada red, con fuente y fecha.
 *
 * Esto no salió de la memoria de nadie. Cada número de aquí se leyó el
 * 16-sep-2026 de la página oficial que se cita en `fuente`, y la cita va
 * pegada al número: si mañana Instagram cambia el tope de 8 MB, la línea que
 * hay que corregir se ve sola y se sabe a qué página ir.
 *
 * Por qué vive en el código y no solo en la base: el motor de piezas necesita
 * las medidas para ELEGIR el lienzo antes de generar nada, y una tabla vacía
 * (base nueva, preview, prueba) no puede dejar al motor sin saber cuánto mide
 * un reel. La ingesta (`scripts/ingest-design-knowledge.ts`) las copia a
 * `design_knowledge` con embeddings para que el Asistente las pueda buscar en
 * lenguaje natural — pero la verdad operativa es este archivo.
 *
 * Tres páginas se negaron a que un programa las leyera y se anota cuál:
 * `business.linkedin.com` contesta HTTP 999 y `business.x.com` HTTP 402. Para
 * LinkedIn se usó su centro de ayuda (`linkedin.com/help/lms/...`), que sí
 * contesta y es de LinkedIn. Para X se usó `docs.x.com`, que también es de X.
 * Ninguna medida viene de un blog de terceros.
 */

export type RedSlug =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'googleads'
  | 'whatsapp';

export type TipoDePieza = 'imagen' | 'video' | 'documento';

export interface FormatoSpec {
  /** Identificador estable. Se guarda en la pieza. */
  id: string;
  /** Cómo se llama para un humano. */
  label: string;
  red: RedSlug;
  tipo: TipoDePieza;
  /** Proporción en texto ("4:5") y su valor para calcular el lienzo. */
  ratio: string;
  ancho: number;
  alto: number;
  /** Tope de peso del archivo, en MB. */
  pesoMaxMb?: number;
  /** Duración del video, en segundos. */
  duracionMinS?: number;
  duracionMaxS?: number;
  /** Cuánto texto admite cada hueco, en caracteres. */
  limites?: { texto?: number; titulo?: number; descripcion?: number; hashtags?: number };
  /**
   * Zona segura: fracción del lienzo que NO debe llevar texto ni logo porque
   * la red le encima su propia interfaz encima.
   */
  zonaSegura?: { arriba?: number; abajo?: number; lados?: number };
  /** Formatos de archivo que acepta la red. */
  archivos: string[];
  /** Lo que hay que saber además del número. */
  nota?: string;
  /** De dónde salió, literal. */
  fuente: string;
  /** Cuándo se leyó esa página. */
  leidoEl: string;
}

const LEIDO = '2026-09-16';

export const FORMATOS: FormatoSpec[] = [
  // -------------------------------------------------------------- Facebook
  {
    id: 'facebook-feed',
    label: 'Facebook — publicación de muro',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '4:5',
    ancho: 1440,
    alto: 1800,
    pesoMaxMb: 30,
    limites: { texto: 150, titulo: 27 },
    archivos: ['jpg', 'png'],
    nota: 'Ancho mínimo 600 px y alto mínimo 750 px en 4:5. Tolerancia de proporción del 3 %.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/image/facebook-feed/link-clicks',
    leidoEl: LEIDO,
  },
  {
    id: 'facebook-historia',
    label: 'Facebook — historia',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '9:16',
    ancho: 1440,
    alto: 2560,
    pesoMaxMb: 30,
    limites: { texto: 125, titulo: 40 },
    zonaSegura: { arriba: 0.14, abajo: 0.35, lados: 0.06 },
    archivos: ['jpg', 'png'],
    nota: 'Ancho mínimo 500 px. Tolerancia de proporción del 1 %.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/image/facebook-story',
    leidoEl: LEIDO,
  },
  {
    id: 'facebook-enlace',
    label: 'Facebook — publicación con enlace',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 630,
    pesoMaxMb: 8,
    limites: { texto: 150, titulo: 27, descripcion: 30 },
    archivos: ['jpg', 'png'],
    nota:
      'La medida de la vista previa de un enlace compartido: "Use images that are at least 1200 x 630 pixels for the best display on high resolution devices", mínimo 200 × 200 px y tope de 8 MB. "Try to keep your images as close to 1.91:1 aspect ratio as possible to display the full image in Feed without any cropping."',
    fuente: 'https://developers.facebook.com/docs/sharing/webmasters/images/',
    leidoEl: LEIDO,
  },
  {
    id: 'facebook-cuadrada',
    label: 'Facebook — publicación cuadrada',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 30,
    limites: { texto: 150, titulo: 27 },
    archivos: ['jpg', 'png'],
    nota:
      'Es el lienzo cuadrado del muro de Facebook: la guía de anuncios publica 1080 × 1080 px para el carrusel de feed, que usa la misma caja. Tolerancia de proporción del 3 %.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed',
    leidoEl: LEIDO,
  },
  {
    id: 'facebook-video',
    label: 'Facebook — video de muro',
    red: 'facebook',
    tipo: 'video',
    ratio: '4:5',
    ancho: 1440,
    alto: 1800,
    pesoMaxMb: 4096,
    duracionMinS: 1,
    duracionMaxS: 14_460,
    limites: { texto: 150, titulo: 27 },
    archivos: ['mp4', 'mov', 'gif'],
    nota:
      'De 1 segundo a 241 minutos y hasta 4 GB. Compresión H.264, píxeles cuadrados, cuadros por segundo fijos, barrido progresivo y audio AAC estéreo a 128 kbps o más. Ancho y alto mínimos de 120 px.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/video/facebook-feed',
    leidoEl: LEIDO,
  },
  {
    id: 'facebook-carrusel',
    label: 'Facebook — carrusel',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 30,
    limites: { texto: 80, titulo: 20, descripcion: 18 },
    archivos: ['jpg', 'png'],
    nota: 'De 2 a 10 tarjetas, todas del mismo tamaño.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed',
    leidoEl: LEIDO,
  },

  {
    /**
     * La burbuja de Messenger y del DM.
     *
     * Va bajo `facebook` y no como red aparte porque es la MISMA conexión y las
     * mismas políticas: la ventana de 24 horas y las etiquetas de mensaje viven
     * en el ámbito de Facebook en `reglas.ts`. Partirlo en una red nueva sería
     * duplicar ocho tablas para pintar un globito.
     */
    id: 'facebook-messenger',
    label: 'Messenger — tarjeta en el chat',
    red: 'facebook',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 628,
    pesoMaxMb: 8,
    limites: { texto: 640, titulo: 80, descripcion: 80 },
    archivos: ['jpg', 'png'],
    nota:
      'La plantilla genérica admite hasta 10 tarjetas y 3 botones por tarjeta; el título y el subtítulo se cortan a 80 caracteres cada uno. Messenger escala o recorta las fotos que no van en 1.91:1. Lo que se manda está sujeto a la ventana de 24 horas.',
    fuente: 'https://developers.facebook.com/docs/messenger-platform/send-messages/template/generic',
    leidoEl: LEIDO,
  },

  // ------------------------------------------------------------- Instagram
  {
    id: 'instagram-feed-45',
    label: 'Instagram — muro vertical (4:5)',
    red: 'instagram',
    tipo: 'imagen',
    ratio: '4:5',
    ancho: 1080,
    alto: 1350,
    pesoMaxMb: 8,
    limites: { texto: 2200, hashtags: 30 },
    archivos: ['jpg'],
    nota:
      'La API solo acepta JPEG. La proporción debe caer entre 4:5 y 1.91:1; ancho mínimo 320 px y máximo 1440 px. El texto alternativo admite hasta 1000 caracteres.',
    fuente:
      'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-feed-11',
    label: 'Instagram — muro cuadrado (1:1)',
    red: 'instagram',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 8,
    limites: { texto: 2200, hashtags: 30 },
    archivos: ['jpg'],
    nota: 'Mismo tope de 8 MB y mismo rango de proporción que el vertical.',
    fuente:
      'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-historia',
    label: 'Instagram — historia',
    red: 'instagram',
    tipo: 'imagen',
    ratio: '9:16',
    ancho: 1440,
    alto: 2560,
    pesoMaxMb: 30,
    limites: { texto: 125 },
    zonaSegura: { arriba: 0.14, abajo: 0.35, lados: 0.06 },
    archivos: ['jpg', 'png'],
    nota:
      'Como anuncio, tope de 30 MB y ancho mínimo 500 px. Publicada por la API de Instagram el tope es 8 MB y solo JPEG.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/image/instagram-story',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-reel',
    label: 'Instagram — reel',
    red: 'instagram',
    tipo: 'video',
    ratio: '9:16',
    ancho: 1080,
    alto: 1920,
    pesoMaxMb: 300,
    duracionMinS: 3,
    duracionMaxS: 900,
    limites: { texto: 2200, hashtags: 30 },
    zonaSegura: { arriba: 0.14, abajo: 0.35, lados: 0.06 },
    archivos: ['mp4', 'mov'],
    nota:
      'MOV o MP4 sin listas de edición y con el átomo moov al frente; video H264 o HEVC, audio AAC a 48 kHz, de 23 a 60 cuadros por segundo, 25 Mbps máximo, ancho máximo 1920 px. La proporción admitida va de 0.01:1 a 10:1, pero la recomendada es 9:16.',
    fuente:
      'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-carrusel',
    label: 'Instagram — carrusel',
    red: 'instagram',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 8,
    limites: { texto: 2200, hashtags: 30 },
    archivos: ['jpg'],
    nota:
      'Hasta 10 piezas. Todas se recortan con la proporción de la PRIMERA, así que las demás tienen que salir del mismo lienzo.',
    fuente: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    leidoEl: LEIDO,
  },

  // -------------------------------------------------------------- LinkedIn
  {
    id: 'linkedin-imagen-191',
    label: 'LinkedIn — imagen horizontal',
    red: 'linkedin',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 628,
    pesoMaxMb: 5,
    limites: { texto: 150, titulo: 70, descripcion: 100 },
    archivos: ['jpg', 'png', 'gif'],
    nota:
      'Mínimo 640 × 360 px y máximo 7680 × 4320 px. Una imagen de menos de 401 px de ancho se pinta como miniatura. El texto de entrada admite hasta 3000 caracteres, pero se trunca pasados 150.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a426534',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-imagen-11',
    label: 'LinkedIn — imagen cuadrada',
    red: 'linkedin',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1200,
    alto: 1200,
    pesoMaxMb: 5,
    limites: { texto: 150, titulo: 70, descripcion: 100 },
    archivos: ['jpg', 'png', 'gif'],
    nota: 'Mínimo 360 × 360 px y máximo 4320 × 4320 px.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a426534',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-imagen-45',
    label: 'LinkedIn — imagen vertical',
    red: 'linkedin',
    tipo: 'imagen',
    ratio: '4:5',
    ancho: 720,
    alto: 900,
    pesoMaxMb: 5,
    limites: { texto: 150, titulo: 70, descripcion: 100 },
    archivos: ['jpg', 'png', 'gif'],
    nota: 'Mínimo 360 × 640 px y máximo 2430 × 4320 px.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a426534',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-carrusel',
    label: 'LinkedIn — carrusel',
    red: 'linkedin',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 10,
    limites: { texto: 150 },
    archivos: ['jpg', 'png', 'gif'],
    nota:
      'De 2 a 10 tarjetas; el GIF tiene que ser estático. Cada tarjeta se escala a 312 × 312 px al pintarse. El botón admite 45 caracteres.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a427022',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-documento',
    label: 'LinkedIn — carrusel en PDF',
    red: 'linkedin',
    tipo: 'documento',
    ratio: '1:1',
    ancho: 1080,
    alto: 1080,
    pesoMaxMb: 100,
    limites: { texto: 150 },
    archivos: ['pdf', 'ppt', 'pptx', 'doc', 'docx'],
    nota:
      'Hasta 300 páginas y 100 MB. Todas las páginas tienen que medir lo mismo — un PDF con páginas de distinto tamaño se ve roto al pasarlo.',
    fuente: 'https://www.linkedin.com/help/linkedin/answer/a518909',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-video',
    label: 'LinkedIn — video vertical',
    red: 'linkedin',
    tipo: 'video',
    ratio: '9:16',
    ancho: 1080,
    alto: 1920,
    pesoMaxMb: 500,
    duracionMinS: 3,
    duracionMaxS: 1800,
    limites: { texto: 150, titulo: 70 },
    archivos: ['mp4'],
    nota:
      'Solo MP4, de 75 KB a 500 MB, menos de 30 cuadros por segundo. Lo recomendado son de 15 a 30 segundos. En 9:16 va de 360 × 640 px a 1080 × 1920 px.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a424737',
    leidoEl: LEIDO,
  },

  // ---------------------------------------------------------------- X
  {
    id: 'twitter-imagen-191',
    label: 'X — imagen horizontal',
    red: 'twitter',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 628,
    pesoMaxMb: 3,
    limites: { texto: 280 },
    archivos: ['jpg', 'png', 'bmp'],
    nota:
      'Tope de 3 MB y ancho mínimo de 800 px. Un GIF subido como anuncio se pinta como imagen fija.',
    fuente: 'https://docs.x.com/x-ads-api/creatives',
    leidoEl: LEIDO,
  },
  {
    id: 'twitter-imagen-11',
    label: 'X — imagen cuadrada',
    red: 'twitter',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1200,
    alto: 1200,
    pesoMaxMb: 3,
    limites: { texto: 280 },
    archivos: ['jpg', 'png', 'bmp'],
    nota: 'Mismo tope de 3 MB y mismo mínimo de 800 px de ancho.',
    fuente: 'https://docs.x.com/x-ads-api/creatives',
    leidoEl: LEIDO,
  },
  {
    id: 'twitter-video',
    label: 'X — video',
    red: 'twitter',
    tipo: 'video',
    ratio: '16:9',
    ancho: 1920,
    alto: 1080,
    pesoMaxMb: 500,
    duracionMaxS: 600,
    limites: { texto: 280 },
    archivos: ['mp4', 'mov'],
    nota: 'Hasta 10 minutos y 500 MB. Proporciones 16:9 y 1:1.',
    fuente: 'https://docs.x.com/x-ads-api/creatives',
    leidoEl: LEIDO,
  },

  // ----------------------------------------------------------------- TikTok
  {
    id: 'tiktok-video',
    label: 'TikTok — video vertical',
    red: 'tiktok',
    tipo: 'video',
    ratio: '9:16',
    ancho: 1080,
    alto: 1920,
    pesoMaxMb: 500,
    duracionMinS: 5,
    duracionMaxS: 600,
    limites: { texto: 100 },
    archivos: ['mp4', 'mov', 'mpeg', '3gp', 'avi'],
    nota:
      'Resolución mínima 540 × 960 px en vertical y tasa de bits de 516 kbps para arriba. El nombre de la cuenta admite 20 caracteres (10 en chino, japonés o coreano) y el pie se corta a 4 líneas.',
    fuente: 'https://ads.tiktok.com/help/article/video-ads-specifications?lang=en',
    leidoEl: LEIDO,
  },

  // ---------------------------------------------------------------- YouTube
  {
    id: 'youtube-miniatura',
    label: 'YouTube — miniatura',
    red: 'youtube',
    tipo: 'imagen',
    ratio: '16:9',
    ancho: 1280,
    alto: 720,
    pesoMaxMb: 2,
    archivos: ['jpg', 'png'],
    nota:
      'YouTube pide 3840 × 2160 px para video (2160 × 3840 para Shorts) con un ancho mínimo de 640 px. El tope es 2 MB subiendo desde el celular y 50 MB desde la computadora: se toma el chico para que la miniatura sirva por los dos caminos.',
    fuente: 'https://support.google.com/youtube/answer/72431?hl=en',
    leidoEl: LEIDO,
  },
  {
    id: 'youtube-short',
    label: 'YouTube — Short',
    red: 'youtube',
    tipo: 'video',
    ratio: '9:16',
    ancho: 1080,
    alto: 1920,
    duracionMaxS: 180,
    archivos: ['mp4', 'mov'],
    nota: 'Hasta 3 minutos y resolución máxima de 1080p.',
    fuente: 'https://support.google.com/youtube/answer/10059070?hl=en',
    leidoEl: LEIDO,
  },

  // ------------------------------------------------------------- Google Ads
  {
    id: 'googleads-responsive-191',
    label: 'Google Ads — display adaptable, horizontal',
    red: 'googleads',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 628,
    pesoMaxMb: 5,
    archivos: ['jpg', 'png', 'gif'],
    nota:
      'Tope de 5120 KB por imagen. Se admiten hasta 15 imágenes en tres proporciones (horizontal, cuadrada y vertical) y hasta 5 logos.',
    fuente: 'https://support.google.com/google-ads/answer/17090561?hl=en',
    leidoEl: LEIDO,
  },
  {
    id: 'googleads-responsive-11',
    label: 'Google Ads — display adaptable, cuadrada',
    red: 'googleads',
    tipo: 'imagen',
    ratio: '1:1',
    ancho: 1200,
    alto: 1200,
    pesoMaxMb: 5,
    archivos: ['jpg', 'png', 'gif'],
    nota: 'Con 1200 × 628 y 1200 × 1200 se cubre la mayoría de los espacios de la red de Google.',
    fuente: 'https://support.google.com/google-ads/answer/17090561?hl=en',
    leidoEl: LEIDO,
  },
  {
    id: 'googleads-display-300x250',
    label: 'Google Ads — display subido (300 × 250)',
    red: 'googleads',
    tipo: 'imagen',
    ratio: '6:5',
    ancho: 300,
    alto: 250,
    pesoMaxMb: 0.15,
    archivos: ['jpg', 'png', 'gif'],
    nota:
      'El display subido a mano tiene tope de 150 KB y solo admite medidas de una lista cerrada: 200×200, 240×400, 250×250, 250×360, 300×250, 336×280, 580×400, 120×600, 160×600, 300×600, 300×1050, 468×60, 728×90, 930×180, 970×90, 970×250, 980×120, 300×50, 320×50 y 320×100.',
    fuente: 'https://support.google.com/google-ads/answer/1722096?hl=en',
    leidoEl: LEIDO,
  },

  // ---------------------------------------------------------------- WhatsApp
  {
    id: 'whatsapp-plantilla-imagen',
    label: 'WhatsApp — imagen de plantilla',
    red: 'whatsapp',
    tipo: 'imagen',
    ratio: '1.91:1',
    ancho: 1200,
    alto: 628,
    pesoMaxMb: 5,
    archivos: ['jpg', 'png'],
    nota:
      'La API de WhatsApp acepta image/jpeg e image/png hasta 5 MB. El video de plantilla llega a 16 MB y el PDF a 100 MB.',
    fuente: 'https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media',
    leidoEl: LEIDO,
  },
];

// ---------------------------------------------------------------------------
// Buscar el formato
// ---------------------------------------------------------------------------

export const REDES: RedSlug[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
  'googleads',
  'whatsapp',
];

export const RED_LABEL: Record<RedSlug, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  googleads: 'Google Ads',
  whatsapp: 'WhatsApp',
};

/** El formato que Goossip usa por omisión cuando solo le dicen la red. */
const POR_OMISION: Record<RedSlug, string> = {
  facebook: 'facebook-feed',
  instagram: 'instagram-feed-45',
  linkedin: 'linkedin-imagen-191',
  twitter: 'twitter-imagen-191',
  tiktok: 'tiktok-video',
  youtube: 'youtube-miniatura',
  googleads: 'googleads-responsive-11',
  whatsapp: 'whatsapp-plantilla-imagen',
};

export function esRed(v: unknown): v is RedSlug {
  return typeof v === 'string' && (REDES as string[]).includes(v);
}

export function formatoPorId(id: string): FormatoSpec | null {
  return FORMATOS.find((f) => f.id === id) ?? null;
}

export function formatosDe(red: RedSlug): FormatoSpec[] {
  return FORMATOS.filter((f) => f.red === red);
}

/**
 * Elegir el lienzo.
 *
 * Con red y nada más, se usa el formato de omisión de esa red. Con una pista
 * ("historia", "reel", "cuadrado", "vertical", "carrusel", "miniatura") se
 * busca el que case. Nunca devuelve null: una pieza sin lienzo no es una pieza.
 */
export function elegirFormato(red: RedSlug, pista?: string | null): FormatoSpec {
  const pool = formatosDe(red);
  const p = (pista ?? '').toLowerCase().trim();

  if (p) {
    const exacto = pool.find((f) => f.id === p);
    if (exacto) return exacto;

    // El ORDEN de estas reglas es la regla.
    //
    // "reel" tiene que probarse ANTES que "9:16", porque en Instagram el
    // primer formato de 9:16 de la lista es la HISTORIA — y pedir un reel y
    // recibir el lienzo de una historia (1440 × 2560 en vez de 1080 × 1920) es
    // una pieza que la red recorta. Pasó, y por eso la prueba lo comprueba.
    const reglas: Array<[RegExp, (f: FormatoSpec) => boolean]> = [
      [/reel/, (f) => f.id.includes('reel')],
      [/short/, (f) => f.id.includes('short')],
      [/historia|story|stories/, (f) => f.id.includes('historia')],
      [/vertical|9:16/, (f) => f.ratio === '9:16'],
      [/carrusel|carousel/, (f) => f.id.includes('carrusel')],
      [/pdf|documento|document/, (f) => f.tipo === 'documento'],
      [/miniatura|thumbnail|portada/, (f) => f.id.includes('miniatura')],
      [/cuadrad|square|1:1/, (f) => f.ratio === '1:1'],
      [/horizontal|apaisad|landscape|1\.91|16:9/, (f) => f.ratio === '1.91:1' || f.ratio === '16:9'],
      [/4:5|retrato|portrait/, (f) => f.ratio === '4:5'],
      [/video|v[ií]deo/, (f) => f.tipo === 'video'],
    ];
    for (const [re, test] of reglas) {
      if (re.test(p)) {
        const hit = pool.find(test);
        if (hit) return hit;
      }
    }
  }

  return formatoPorId(POR_OMISION[red]) ?? pool[0]!;
}

/** El píxel exacto de la zona segura, para dibujar y para revisar. */
export function zonaSeguraPx(f: FormatoSpec): { arriba: number; abajo: number; lados: number } {
  const z = f.zonaSegura ?? {};
  return {
    arriba: Math.round(f.alto * (z.arriba ?? 0)),
    abajo: Math.round(f.alto * (z.abajo ?? 0)),
    lados: Math.round(f.ancho * (z.lados ?? 0)),
  };
}

/**
 * La spec dicha en español, con su fuente. Es lo que contesta el Asistente
 * cuando le preguntan "¿qué medidas lleva un reel?" y lo que se ingiere a
 * `design_knowledge` para poder buscarla en lenguaje natural.
 */
export function specEnPalabras(f: FormatoSpec): string {
  const partes: string[] = [
    `${f.label}: ${f.ancho} × ${f.alto} px (${f.ratio}).`,
  ];
  if (f.pesoMaxMb !== undefined) {
    partes.push(
      f.pesoMaxMb < 1
        ? `Pesa como máximo ${Math.round(f.pesoMaxMb * 1024)} KB.`
        : `Pesa como máximo ${f.pesoMaxMb} MB.`,
    );
  }
  if (f.duracionMaxS !== undefined) {
    const min = f.duracionMinS ? `de ${f.duracionMinS} s` : 'hasta';
    partes.push(`Dura ${min} a ${f.duracionMaxS} s.`);
  }
  partes.push(`Archivos: ${f.archivos.join(', ')}.`);
  if (f.limites?.texto) partes.push(`El texto se corta a ${f.limites.texto} caracteres.`);
  if (f.limites?.titulo) partes.push(`El título, a ${f.limites.titulo}.`);
  if (f.limites?.hashtags) partes.push(`Hasta ${f.limites.hashtags} hashtags.`);
  if (f.zonaSegura) {
    const z = zonaSeguraPx(f);
    partes.push(
      `Zona segura: deja libres ${z.arriba} px arriba, ${z.abajo} px abajo y ${z.lados} px a cada lado — ahí la red encima sus botones.`,
    );
  }
  if (f.nota) partes.push(f.nota);
  partes.push(`Fuente: ${f.fuente} (leída el ${f.leidoEl}).`);
  return partes.join(' ');
}

/** Cuántas redes traen al menos un formato con fuente citada. */
export function redesConFuente(): RedSlug[] {
  return REDES.filter((r) => formatosDe(r).some((f) => f.fuente.startsWith('http')));
}
