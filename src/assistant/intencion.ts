/**
 * "Hazme una imagen de…" en lenguaje normal.
 *
 * Viene de un arreglo que Luis metió a `main` el 16-sep, sobre el chat global:
 * el agente de texto no tenía herramienta de imagen, así que se detectaba la
 * intención y se mandaba directo a Gemini para que nadie tuviera que saber que
 * existía un comando `/imagen`.
 *
 * Esta corrida se lleva el chat global por delante, pero **el comportamiento no
 * se pierde**: se trae aquí, y mejor de lo que estaba. La causa raíz de allá
 * —"el agente no tiene la herramienta"— ya no existe: el Asistente del proyecto
 * SÍ la tiene (`hacer-pieza`), con el kit de marca, el lienzo que pide la red y
 * tres opciones. Lo que se conserva es la GARANTÍA: si alguien pidió una
 * imagen, sale una imagen, aunque el modelo no se acuerde de llamar a la
 * herramienta.
 *
 * Dos cosas hace esto, y ninguna es adivinar:
 *   1. Le avisa al modelo, dentro del turno, que lo que le están pidiendo es
 *      una pieza — para que llame a la herramienta correcta a la primera.
 *   2. Si el turno acaba sin una sola pieza, se hace igual. Es la red.
 */

/** El comando explícito de siempre. Sigue funcionando. */
const COMANDO = /^\/imagen\s+(.+)/is;

/**
 * Pedir una imagen con las palabras de uno.
 *
 * El verbo y el sustantivo van separados con hasta 60 caracteres en medio para
 * que caiga "hazme una imagen bien chida de…" sin que caiga "necesito que me
 * expliques cómo se hace una imagen" — que es una pregunta, no un encargo.
 */
/**
 * Los verbos. `dis[eé][ñn]a` y no `dise[ñn]a` porque en español de verdad la
 * gente escribe **diséñame**, con acento en la primera e — y con el patrón sin
 * acento ese pedido no se detectaba. Lo cazó la prueba.
 */
const VERBOS =
  'haz|hazme|hazle|gen[eé]ra(?:me|le)?|cr[eé]a(?:me)?|dis[eé][ñn]a(?:me)?|dibuja(?:me)?|arma(?:me)?|dame|quiero|necesito|ocupo|p[oó]n(?:le)?|puedes?\\s+(?:hacer|generar|crear|dis[eé][ñn]ar)';

/**
 * Los sustantivos. Van los genéricos ("imagen", "pieza") y también los
 * FORMATOS, porque "hazme una historia para Instagram" es un encargo de pieza
 * aunque nadie diga la palabra "imagen" — y así lo pide la gente.
 *
 * "post" NO está a propósito: "hazme un post" es un encargo de TEXTO. El
 * Asistente ya ofrece la imagen después, por su cuenta.
 */
const COSAS =
  'imagen|im[aá]genes|foto|fotos|pieza|piezas|ilustraci[oó]n|visual|portada|banner|flyer|cartel|thumbnail|miniatura|render|historia|historias|stor(?:y|ies)|reel|reels|carrusel|carousel';

const INTENCION = new RegExp(`\\b(?:${VERBOS})\\b[^\\n]{0,60}?\\b(?:una?\\s+)?(?:${COSAS})\\b`, 'i');

const VERBO_INICIAL = new RegExp(`^\\s*(?:por\\s+favor\\s+)?(?:${VERBOS})\\s+`, 'i');

/** Cuando el usuario nombra la red, se le hace caso y no se elige por él. */
const REDES: Array<[RegExp, string]> = [
  [/\binstagram\b|\big\b/i, 'instagram'],
  [/\bfacebook\b|\bfb\b/i, 'facebook'],
  [/\blinked\s?in\b/i, 'linkedin'],
  [/\btiktok\b|\btik\s?tok\b/i, 'tiktok'],
  [/\byoutube\b|\byt\b/i, 'youtube'],
  [/\bwhats\s?app\b/i, 'whatsapp'],
  [/\bgoogle\s+ads\b/i, 'googleads'],
  [/\b(x|twitter)\b/i, 'twitter'],
];

/** La pista de formato, con las palabras que usa la gente. */
const FORMATOS: Array<[RegExp, string]> = [
  [/\breel(s)?\b/i, 'reel'],
  [/\bhistoria(s)?\b|\bstor(y|ies)\b/i, 'historia'],
  [/\bcarrusel\b|\bcarousel\b/i, 'carrusel'],
  [/\bminiatura\b|\bthumbnail\b|\bportada\b/i, 'miniatura'],
  [/\bcuadrad[oa]\b|\bsquare\b/i, 'cuadrado'],
  [/\bvertical\b/i, 'vertical'],
  [/\bhorizontal\b|\bapaisad[oa]\b/i, 'horizontal'],
];

export interface PedidoDeImagen {
  /** Lo que describió el usuario, sin el verbo de arranque. */
  brief: string;
  /** La red, si la nombró. */
  red: string | null;
  /** La pista de formato, si la dio. */
  formato: string | null;
  /** `true` si vino por `/imagen`, que no admite duda. */
  explicito: boolean;
}

export function detectarPedidoDeImagen(texto: string): PedidoDeImagen | null {
  const t = (texto ?? '').trim();
  if (!t) return null;

  const comando = t.match(COMANDO);
  const esComando = Boolean(comando);
  if (!esComando && !INTENCION.test(t)) return null;

  // Se quita el verbo de arranque y se deja la descripción tal cual la dio el
  // usuario: reescribírsela es el camino corto a una pieza que no pidió.
  const brief = (esComando ? comando![1]! : t.replace(VERBO_INICIAL, '')).trim();
  if (brief.length < 3) return null;

  const red = REDES.find(([re]) => re.test(t))?.[1] ?? null;
  const formato = FORMATOS.find(([re]) => re.test(t))?.[1] ?? null;

  return { brief, red, formato, explicito: esComando };
}

/**
 * El aviso que se le mete al modelo cuando se detecta el pedido.
 *
 * Es un empujón, no una orden de saltarse el turno: el modelo sigue pudiendo
 * preguntar algo antes si de verdad falta. Lo que ya no pasa es que conteste
 * con un párrafo describiendo la imagen que haría.
 */
export function avisoDeImagen(p: PedidoDeImagen): string {
  return [
    'AVISO: el usuario está pidiendo una PIEZA GRÁFICA, no una descripción.',
    `Llama a la herramienta hacer-pieza con brief="${p.brief.slice(0, 200)}"`,
    p.red ? `y red="${p.red}"` : 'y la red que mejor le venga a este proyecto',
    p.formato ? `y formato="${p.formato}".` : '.',
    'No contestes describiendo la imagen: hazla.',
  ].join(' ');
}
