/**
 * El candado del selector de autonomía, en un archivo suyo.
 *
 * Son DOS modos y no un deslizador con matices, porque en la práctica solo hay
 * dos preguntas que el usuario se hace: "¿lo revisa alguien antes de salir?" y
 * "¿o sale?". Todo lo de en medio se lo tendría que explicar una leyenda.
 *
 * El candado no es el selector: es `puedeOperar`. Alguien con rol de lector
 * puede poner "Publica solo" en su navegador todo lo que quiera — el modo se
 * fuerza a "Propone" en el SERVIDOR, y además las tools de publicar ni siquiera
 * se le arman. Dos candados, ninguno en la pantalla.
 *
 * Vive aquí y no dentro del agente por una razón práctica: el agente arrastra
 * media app detrás (el modelo, las tools, la memoria) y esto tiene que poder
 * comprobarse en una prueba sin levantar nada.
 */

export type Autonomia = 'propone' | 'publica';

/**
 * Se llama DOS veces por turno: en la ruta, antes de armar nada, y otra vez al
 * armar las instrucciones. Repetirlo no es desconfianza del otro lado: es que
 * el día que alguien llame al Asistente desde un cron o desde una prueba, el
 * candado siga puesto sin que haya que acordarse de ponerlo.
 */
export function autonomiaEfectiva(pedida: unknown, puedeOperar: boolean): Autonomia {
  return pedida === 'publica' && puedeOperar ? 'publica' : 'propone';
}
