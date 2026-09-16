/**
 * La REGLA DURA del issue #47: el Asistente dice lo que hizo la herramienta.
 *
 * Vive en su propio archivo —y sin un solo import— por dos razones:
 *
 *   · `project-agent.ts` arrastra Mastra, el proveedor del modelo y
 *     `lib/gemini-vision.ts`, que trae `server-only` y revienta fuera de Next.
 *     Una regla de esta importancia tiene que poder probarse con `tsx` sin
 *     levantar medio framework.
 *   · Es lógica pura. Meterla junto al agente la volvería imposible de medir sin
 *     gastar una llamada al modelo, y una prueba que cuesta dinero es una prueba
 *     que nadie corre.
 *
 * El caso que la trajo, medido el 16-sep-2026: el Asistente publicó de verdad
 * (`urn:li:share:7505967549709213696`, fila `9ec7abe3` en `posts`) y le contestó
 * al usuario que había fallado **por contenido duplicado**. Quien lee eso vuelve
 * a publicar y le sale doble. No es un matiz de redacción: es un post duplicado
 * en la cuenta de un cliente.
 */

/** Se publicó, pero la red no devolvió enlace. NO es lo mismo que no publicar. */
export const SIN_ENLACE = 'publicado-sin-enlace';

/**
 * Las palabras con las que el modelo narró un fallo que no existió.
 *
 * "duplicado" está en la lista porque es literalmente lo que contestó.
 */
const SUENA_A_FALLO =
  /\b(no se pudo|no pude|no logr[éo]|fall[óo]|falla|error|rechaz[óo]|duplicad[oa]|no se public[óo]|int[ée]ntalo de nuevo|vuelve a intentarlo)\b/i;

/**
 * La red de seguridad.
 *
 * El system prompt ya le pide la verdad; esto la GARANTIZA. Un system prompt es
 * una petición y la QA midió al modelo ignorándola.
 *
 * Tres caminos, y el tercero es el que importa:
 *   · dijo la verdad y puso el enlace → no se toca nada;
 *   · dijo la verdad y le faltó el enlace → se agrega, conservando su texto;
 *   · **narró un fallo que no ocurrió → su texto NO se conserva.** Es justo el
 *     que hace que alguien republique.
 */
export function garantizarVerdad(texto: string, publicado: string | null): string {
  if (!publicado) return texto;

  const enlace = publicado === SIN_ENLACE ? null : publicado;
  const traeElEnlace = enlace ? texto.includes(enlace) : false;
  const suenaAFallo = SUENA_A_FALLO.test(texto);

  if (traeElEnlace && !suenaAFallo) return texto;

  const verdad = enlace
    ? `Ya quedó publicado: ${enlace}`
    : 'Ya quedó publicado. La red todavía no devuelve el enlace; en un momento aparece en tu perfil.';

  if (!suenaAFallo) {
    return texto.trim() ? `${texto.trim()}\n\n${verdad}` : verdad;
  }

  return `${verdad}\n\n(Lo que te iba a contestar decía que había fallado y no es cierto: el post existe, con el enlace de arriba.)`;
}
