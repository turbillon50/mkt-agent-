/**
 * Los comandos con barra del compose.
 *
 * Archivo PURO: lo importa el compose (navegador) para pintar el menú y lo
 * importa el servidor para expandir el comando antes de armar el turno. Una
 * sola lista para los dos, porque el día que se agregue `/analiza` no puede
 * existir en el menú y no en el servidor.
 *
 * La decisión que importa: un comando NO es una ruta de código aparte. Se
 * expande a la frase que un usuario escribiría, y esa frase es la que ve el
 * modelo con sus herramientas de siempre. Un `/publica` con su propio manejador
 * sería una segunda forma de publicar —con su propio candado de permisos que
 * alguien olvidará revisar— además de la que ya existe.
 */

export interface Comando {
  /** Sin la barra. */
  nombre: string;
  ayuda: string;
  /** Lo que se le manda al modelo. `{resto}` se sustituye por lo que se escribió después. */
  plantilla: string;
  /** Si es true, el comando pide argumento y el menú lo dice. */
  pideArgumento: boolean;
  /** Solo para quien puede operar el proyecto. */
  requiereOperar?: boolean;
}

export const COMANDOS: Comando[] = [
  {
    nombre: 'pieza',
    ayuda: 'Hazme las piezas de una publicación',
    plantilla:
      'Hazme las piezas para {resto}. Dame tres opciones con ángulos distintos, con el kit de marca del proyecto, y dime qué medidas usaste y de dónde salieron.',
    pideArgumento: true,
  },
  {
    nombre: 'publica',
    ayuda: 'Publica en una red del proyecto',
    plantilla:
      'Quiero publicar {resto}. Antes de publicar, enséñame el texto exacto y la pieza, y espera a que yo diga que sí.',
    pideArgumento: true,
    requiereOperar: true,
  },
  {
    nombre: 'leads',
    ayuda: 'Qué hay en los leads del proyecto',
    plantilla:
      'Dime cómo van los leads de este proyecto: cuántos hay sin contactar, de dónde vienen y cuáles atiendo primero. {resto}',
    pideArgumento: false,
  },
  {
    nombre: 'medidas',
    ayuda: 'Qué medidas lleva un formato',
    plantilla:
      '¿Qué medidas lleva {resto}? Usa la herramienta de medidas y cita la fuente con su fecha.',
    pideArgumento: true,
  },
  {
    nombre: 'campaña',
    ayuda: 'Arma o revisa una campaña',
    plantilla:
      'Ayúdame con la campaña: {resto}. Dime objetivo, a quién le hablamos, qué piezas hacen falta y qué presupuesto tiene sentido.',
    pideArgumento: true,
  },
];

/** `/pieza` y `/campaña` se escriben con y sin acento. Los dos entran. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buscarComando(nombre: string): Comando | null {
  const n = normalizar(nombre);
  return COMANDOS.find((c) => normalizar(c.nombre) === n) ?? null;
}

/** Los que se le ofrecen a alguien mientras escribe `/al…`. */
export function comandosQueEmpiezanCon(prefijo: string, puedeOperar: boolean): Comando[] {
  const p = normalizar(prefijo);
  return COMANDOS.filter(
    (c) => (!c.requiereOperar || puedeOperar) && normalizar(c.nombre).startsWith(p),
  );
}

/**
 * Expande el comando si el mensaje empieza con uno. Si no, devuelve el mensaje
 * tal cual: escribir "/algo" que no existe no es un error, es texto.
 */
export function expandirComando(mensaje: string): string {
  const m = mensaje.match(/^\/([\p{L}]+)\s*([\s\S]*)$/u);
  if (!m) return mensaje;
  const comando = buscarComando(m[1]!);
  if (!comando) return mensaje;
  const resto = (m[2] ?? '').trim();
  if (comando.pideArgumento && !resto) {
    // Sin argumento no se inventa uno: se le pasa al modelo la pregunta que un
    // humano haría. Rellenarlo con "algo" acaba en una pieza de nada.
    return `${comando.ayuda}. Pregúntame de qué, que no lo dije.`;
  }
  return comando.plantilla.replace('{resto}', resto).replace(/\s+/g, ' ').trim();
}
