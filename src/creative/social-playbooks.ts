import type { OpcionCreativa } from './gemini';
import type { RedSlug } from './specs';

export type RedPublicable = Extract<
  RedSlug,
  'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'youtube'
>;

export interface SocialPlaybook {
  red: RedPublicable;
  objetivo: string;
  estructuraCopy: string;
  tono: string;
  hashtagsMax: number;
  caracteresMax: number;
  formatoPista: string;
  cta: string;
  fuente: string;
  version: string;
  angulos: OpcionCreativa[];
}

/**
 * Reglas operativas por red. No son un prompt genérico rebautizado: cada red
 * tiene otra intención, ritmo de lectura, lienzo y dirección visual. Las
 * medidas exactas siguen viviendo en specs.ts; aquí vive el lenguaje creativo.
 */
export const SOCIAL_PLAYBOOKS: Record<RedPublicable, SocialPlaybook> = {
  facebook: {
    red: 'facebook',
    objetivo: 'Conversación, confianza local y clic o mensaje.',
    estructuraCopy: 'Contexto reconocible, beneficio concreto, prueba breve y pregunta o CTA.',
    tono: 'Cercano y explicativo; párrafos cortos, sin parecer anuncio clasificado.',
    hashtagsMax: 3,
    caracteresMax: 800,
    formatoPista: 'feed 4:5',
    cta: 'Invitar a comentar, mandar mensaje o abrir el enlace.',
    fuente: 'https://www.facebook.com/business/ads-guide/update/image/facebook-feed/link-clicks',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Historia visible', direccion: 'convertir el beneficio central del encargo en una escena editorial concreta y reconocible; usar personas sólo si la verdad del proyecto las justifica' },
      { angulo: 'Demostración', direccion: 'mostrar el servicio, producto o proceso real en acción mediante detalles verificables, sin inventar pantallas, inmuebles ni resultados' },
      { angulo: 'Comunidad', direccion: 'representar la relación entre las personas o actores reales del negocio con lenguaje documental, nunca poses o fotografía de stock genérica' },
    ],
  },
  instagram: {
    red: 'instagram',
    objetivo: 'Detener el scroll, provocar guardados y construir deseo visual.',
    estructuraCopy: 'Gancho de una línea, microhistoria, valor accionable y CTA para guardar o enviar.',
    tono: 'Visual, específico y con ritmo; emojis solo si ayudan a escanear.',
    hashtagsMax: 8,
    caracteresMax: 2200,
    formatoPista: 'feed vertical 4:5',
    cta: 'Guardar, compartir por DM o visitar el perfil.',
    fuente: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Hero editorial', direccion: 'elegir un artefacto real del contexto del proyecto y convertirlo mediante un solo giro editorial inesperado pero físicamente plausible; fondo limpio, luz de estudio y espacio para un titular corto; nunca gemas, cristales, circuitos ni símbolos genéricos de tecnología' },
      { angulo: 'Detalle propio', direccion: 'macro o recorte cercano de un objeto, material, gesto o proceso que sólo pueda pertenecer a este negocio; textura real, luz premium y cero utilería genérica' },
      { angulo: 'Sistema de marca', direccion: 'bodegón editorial con tres elementos reales del negocio organizados por tensión, escala y espacio negativo; materialidad mate o física, nunca códigos, letras, hologramas, gemas ni dashboards falsos' },
    ],
  },
  linkedin: {
    red: 'linkedin',
    objetivo: 'Demostrar criterio, generar conversación profesional y confianza.',
    estructuraCopy: 'Tesis clara, evidencia o experiencia, aprendizaje útil y pregunta profesional.',
    tono: 'Experto y humano; sin frases de gurú ni párrafos artificiales de una palabra.',
    hashtagsMax: 4,
    caracteresMax: 1500,
    formatoPista: 'horizontal 1.91:1',
    cta: 'Pedir una opinión informada o abrir una conversación.',
    fuente: 'https://www.linkedin.com/help/lms/answer/a426331',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Idea ejecutiva', direccion: 'composición editorial sobria con una metáfora visual precisa, mucho aire y jerarquía de revista de negocios' },
      { angulo: 'Evidencia', direccion: 'un resultado, artefacto o proceso que exista en el contexto del proyecto, fotografiado o representado con sobriedad; sin oficina de stock' },
      { angulo: 'Sistema explicado', direccion: 'relaciones visuales minimalistas entre elementos reales del negocio, sin texto, cifras, diagramas técnicos falsos ni interfaces inventadas' },
    ],
  },
  twitter: {
    red: 'twitter',
    objetivo: 'Entrar en la conversación con una idea memorable y fácil de responder.',
    estructuraCopy: 'Una observación fuerte, una consecuencia y una invitación breve a responder.',
    tono: 'Directo, ágil y conversacional; una idea por publicación.',
    hashtagsMax: 2,
    caracteresMax: 270,
    formatoPista: 'horizontal 1.91:1',
    cta: 'Provocar respuesta o clic sin vender de más.',
    fuente: 'https://docs.x.com/x-api/posts/create-post',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Idea instantánea', direccion: 'una metáfora visual simple entendible en menos de un segundo, un solo sujeto y contraste muy alto' },
      { angulo: 'Prueba visual', direccion: 'recorte de un elemento real del producto, servicio o proceso que sostenga la afirmación, sin decoración ni pantallas inventadas' },
      { angulo: 'Señal de marca', direccion: 'composición horizontal audaz con un símbolo propio del negocio y formas grandes; espacio para una frase corta que se añadirá después' },
    ],
  },
  tiktok: {
    red: 'tiktok',
    objetivo: 'Retención inmediata y consumo completo del video.',
    estructuraCopy: 'Gancho de 1-2 segundos, demostración, giro o resultado y CTA breve.',
    tono: 'Natural, rápido y demostrativo; debe sonar hablado, no leído.',
    hashtagsMax: 5,
    caracteresMax: 900,
    formatoPista: 'video vertical 9:16',
    cta: 'Comentar, guardar o ver la segunda parte.',
    fuente: 'https://developers.tiktok.com/doc/content-posting-api-reference-direct-post',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Resultado primero', direccion: 'fotograma vertical con el resultado ya visible, acción congelada y espacio seguro para subtítulos grandes' },
      { angulo: 'POV humano', direccion: 'perspectiva de primera persona auténtica, manos o acción real y sensación de captura nativa de celular de alta calidad' },
      { angulo: 'Demostración rápida', direccion: 'secuencia sugerida de tres pasos con movimiento implícito, encuadre vertical y foco absoluto en lo que cambia' },
    ],
  },
  youtube: {
    red: 'youtube',
    objetivo: 'Maximizar clic cualificado y prometer con honestidad lo que entrega el video.',
    estructuraCopy: 'Título con resultado o tensión; descripción que aclara valor, capítulos y siguiente paso.',
    tono: 'Claro, concreto y curioso sin clickbait engañoso.',
    hashtagsMax: 3,
    caracteresMax: 3000,
    formatoPista: 'miniatura 16:9',
    cta: 'Ver el video, suscribirse o continuar con otro contenido.',
    fuente: 'https://developers.google.com/youtube/v3/docs/videos/insert',
    version: '2026-09-16',
    angulos: [
      { angulo: 'Tensión narrativa', direccion: 'miniatura cinematográfica con un conflicto visual claro, sujeto grande y separación fuerte del fondo' },
      { angulo: 'Transformación', direccion: 'contraste visual entre problema y resultado, legible a tamaño pequeño y sin collage saturado' },
      { angulo: 'Objeto protagonista', direccion: 'un objeto o resultado central sobredimensionado, iluminación dramática y composición de máxima legibilidad móvil' },
    ],
  },
};

export function esRedPublicable(red: unknown): red is RedPublicable {
  return typeof red === 'string' && red in SOCIAL_PLAYBOOKS;
}

export function playbookDe(red: RedPublicable): SocialPlaybook {
  return SOCIAL_PLAYBOOKS[red];
}

export function angulosParaRed(red: RedSlug): OpcionCreativa[] {
  return esRedPublicable(red) ? SOCIAL_PLAYBOOKS[red].angulos : SOCIAL_PLAYBOOKS.instagram.angulos;
}
