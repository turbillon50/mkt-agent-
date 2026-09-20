/**
 * Dónde corta cada red el texto, y dónde deja de aceptarlo.
 *
 * Son DOS cosas distintas y confundirlas es el error que este archivo existe
 * para no cometer:
 *
 *   · el **corte** es de PANTALLA — pasados N caracteres la red esconde el
 *     resto detrás de un "ver más". El texto entero se publica; nada más que la
 *     mitad no la lee nadie. Es un aviso, no un error.
 *   · el **tope** es de ACEPTACIÓN — pasados N caracteres la red RECHAZA la
 *     publicación. X a los 280 es esto. Es un error y bloquea.
 *
 * Y la honestidad sobre de dónde salió cada número, que es lo que separa esto
 * de una lista copiada de un blog: cada entrada dice su `origen`.
 *
 *   `oficial`   — está publicado por la red y viene con su URL y su fecha.
 *   `observado` — es comportamiento de la aplicación, que ninguna red publica
 *                 en un documento. Se usa para SIMULAR el "ver más" del visor y
 *                 la pantalla lo dice con esas palabras. Nunca bloquea nada:
 *                 un número observado no rechaza una pieza, solo avisa.
 *
 * Por eso vive aparte de `specs.ts`: aquel archivo promete en su cabecera que
 * cada número trae página oficial, y mezclar aquí lo observado rompería esa
 * promesa sin que se notara.
 */
import { RED_LABEL, type RedSlug } from './specs';

export type OrigenDelNumero = 'oficial' | 'observado';

export interface Corte {
  red: RedSlug;
  /** Caracteres que se ven antes del "ver más". null = no corta. */
  visible: number | null;
  /** Caracteres que la red ACEPTA. Pasado esto, rechaza. null = sin tope conocido. */
  tope: number | null;
  /** El tope del título, donde la red tiene uno aparte del cuerpo. */
  topeTitulo?: number | null;
  origenVisible: OrigenDelNumero;
  origenTope: OrigenDelNumero;
  /** Cómo se llama el hueco donde va el texto, para decirlo en español. */
  hueco: string;
  /** El botón que la red pinta para abrir el resto. */
  etiquetaVerMas: string;
  fuente: string | null;
  leidoEl: string | null;
  nota?: string;
}

const LEIDO = '2026-09-16';

export const CORTES: Record<RedSlug, Corte> = {
  facebook: {
    red: 'facebook',
    visible: 63,
    tope: 63206,
    origenVisible: 'observado',
    origenTope: 'observado',
    hueco: 'el texto de la publicación',
    etiquetaVerMas: 'Ver más',
    fuente: null,
    leidoEl: null,
    nota:
      'Facebook no publica dónde corta. En el muro del celular se ven unas tres líneas — del orden de 63 caracteres— y el resto va detrás de "Ver más". Se usa para simular el corte, nunca para bloquear.',
  },
  instagram: {
    red: 'instagram',
    visible: 125,
    tope: 2200,
    origenVisible: 'observado',
    origenTope: 'oficial',
    hueco: 'el pie de foto',
    etiquetaVerMas: 'más',
    fuente: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    leidoEl: LEIDO,
    nota:
      'El tope de 2200 caracteres y los 30 hashtags son de la documentación de publicación de Instagram. Los 125 visibles son de la aplicación: Instagram no los publica.',
  },
  linkedin: {
    red: 'linkedin',
    visible: 140,
    tope: 3000,
    origenVisible: 'observado',
    origenTope: 'oficial',
    hueco: 'el texto de la entrada',
    etiquetaVerMas: '…ver más',
    fuente: 'https://www.linkedin.com/help/lms/answer/a426534',
    leidoEl: LEIDO,
    nota:
      'LinkedIn acepta 3000 caracteres en el texto de entrada. El corte no es uno solo: en el celular se ven del orden de 140 caracteres y en la computadora del orden de 210. El visor usa el del celular, que es el que más recorta y por tanto el que hay que ganar.',
  },
  twitter: {
    red: 'twitter',
    visible: 280,
    tope: 280,
    origenVisible: 'oficial',
    origenTope: 'oficial',
    hueco: 'el tuit',
    // X no tiene "ver más" en el cuerpo: a los 280 no esconde, RECHAZA.
    etiquetaVerMas: '',
    fuente: 'https://docs.x.com/x-api/posts/creation-of-a-post',
    leidoEl: LEIDO,
    nota:
      'En X el corte y el tope son el mismo número: 280 caracteres. No hay "ver más" — pasado ahí la publicación no sale. Para decir más, se hace un hilo.',
  },
  tiktok: {
    red: 'tiktok',
    visible: 2200,
    tope: 4000,
    origenVisible: 'observado',
    origenTope: 'observado',
    hueco: 'el pie del video',
    etiquetaVerMas: 'más',
    fuente: null,
    leidoEl: null,
    nota:
      'El pie de TikTok admite del orden de 4000 caracteres y la aplicación enseña las primeras líneas —unos 2200 caracteres— antes del "más". Ninguno de los dos está publicado en un documento de TikTok: se usan para simular, no para bloquear.',
  },
  youtube: {
    red: 'youtube',
    visible: 100,
    tope: 100,
    topeTitulo: 100,
    origenVisible: 'oficial',
    origenTope: 'oficial',
    hueco: 'el título del video',
    etiquetaVerMas: '',
    fuente: 'https://support.google.com/youtube/answer/57404',
    leidoEl: LEIDO,
    nota:
      'El título de YouTube admite 100 caracteres y la descripción 5000. El visor mide el TÍTULO, que es la mitad del clic junto con la miniatura.',
  },
  googleads: {
    red: 'googleads',
    visible: 30,
    tope: 30,
    topeTitulo: 30,
    origenVisible: 'oficial',
    origenTope: 'oficial',
    hueco: 'el título del anuncio',
    etiquetaVerMas: '',
    fuente: 'https://support.google.com/google-ads/answer/12437745',
    leidoEl: LEIDO,
    nota: 'Los títulos del anuncio adaptable de búsqueda admiten 30 caracteres y las descripciones 90.',
  },
  whatsapp: {
    red: 'whatsapp',
    visible: null,
    tope: 1024,
    origenVisible: 'observado',
    origenTope: 'oficial',
    hueco: 'el cuerpo de la plantilla',
    etiquetaVerMas: 'Leer más',
    fuente: 'https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates',
    leidoEl: LEIDO,
    nota: 'El cuerpo de una plantilla de WhatsApp admite 1024 caracteres.',
  },
};

export function corteDe(red: RedSlug): Corte {
  return CORTES[red];
}

/**
 * Partir el texto donde lo parte la red.
 *
 * Corta por PALABRA, no por carácter, porque así corta la red: nadie ha visto
 * un "ver más" que parta "departamen…to". Si la primera palabra ya no cabe, se
 * corta a lo bruto — es el único caso donde partir una palabra es lo correcto.
 */
export function partirDondeCorta(
  texto: string,
  visible: number | null,
): { visible: string; oculto: string; cortado: boolean } {
  if (visible === null || texto.length <= visible) {
    return { visible: texto, oculto: '', cortado: false };
  }
  const bruto = texto.slice(0, visible);
  const ultimoEspacio = bruto.lastIndexOf(' ');
  const corte = ultimoEspacio > visible * 0.6 ? ultimoEspacio : visible;
  return {
    visible: texto.slice(0, corte).trimEnd(),
    oculto: texto.slice(corte).trimStart(),
    cortado: true,
  };
}

/** El corte, dicho para una persona. Va en el panel de la Sala. */
export function corteEnPalabras(c: Corte): string {
  const partes: string[] = [];
  if (c.visible !== null && c.visible !== c.tope) {
    partes.push(
      `${RED_LABEL[c.red]} enseña los primeros ${c.visible} caracteres de ${c.hueco} y esconde el resto detrás de "${c.etiquetaVerMas}".`,
    );
  }
  if (c.tope !== null) {
    partes.push(
      c.visible === c.tope
        ? `${RED_LABEL[c.red]} acepta ${c.tope} caracteres en ${c.hueco} y ni uno más: pasado ahí no publica.`
        : `El tope que acepta son ${c.tope} caracteres.`,
    );
  }
  if (c.nota) partes.push(c.nota);
  if (c.fuente) partes.push(`Fuente: ${c.fuente} (leída el ${c.leidoEl}).`);
  return partes.join(' ');
}
