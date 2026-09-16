/**
 * El contexto del Asistente: EN QUÉ PROYECTO está parado.
 *
 * Esta es la corrección de fondo de la corrida 6. Hasta la 5, el chat era
 * global y sus tools publicaban con "la cuenta de la casa" porque no tenían a
 * quién preguntarle de quién era la cuenta. Ahora no hay Asistente sin
 * proyecto: el contexto se arma en el servidor, después de pasar por la puerta
 * del proyecto, y viaja atado a las tools.
 *
 * Y la decisión que importa: **el `projectId` NO lo manda el modelo.**
 *
 * El issue dice "las tools reciben projectId obligatorio". Obligatorio en el
 * esquema significa que el modelo lo tiene que escribir — y un modelo que
 * escribe un id puede escribir OTRO id, el del cliente de al lado, y la tool
 * lo obedecería. Aquí el proyecto viene cerrado en la tool (ver
 * `project-tools.ts`), que es lo que el issue quiere de verdad: que ninguna
 * acción salga sin proyecto y que sea SIEMPRE el proyecto en el que está
 * parado el usuario que la pidió, con el permiso que ya se le revisó.
 */
import type { Project, ProjectBrandKit } from '../db/schema';
import { composioUserId } from '../projects/connections';

export interface AgentContext {
  project: Project;
  orgId: string;
  /** El correo de quien está hablando. Se registra en lo que se publique. */
  quien: string | null;
  /** Qué puede hacer esta persona en ESTE proyecto. */
  puedeOperar: boolean;
  kit: ProjectBrandKit | null;
}

/**
 * La identidad del proyecto ante Composio. Una sola función para toda la app:
 * `project:<uuid>`. Si algún día se lee un id suelto en un log de Composio, se
 * entiende sin tabla de traducción.
 */
export function identidadDeCanal(ctx: AgentContext): string {
  return composioUserId(ctx.project.id);
}

/** La ficha del proyecto que se le pone al modelo en las instrucciones. */
export function fichaDelProyecto(ctx: AgentContext): string {
  const p = ctx.project;
  const lineas = [
    `Estás trabajando en el proyecto "${p.name}".`,
    p.kind ? `Giro: ${p.kind}.` : null,
    p.city || p.country ? `Ubicación: ${[p.city, p.country].filter(Boolean).join(', ')}.` : null,
    p.website ? `Sitio: ${p.website}.` : null,
    p.audience ? `A quién le habla: ${p.audience}.` : null,
  ].filter(Boolean);

  if (ctx.kit) {
    const colores = ctx.kit.paleta.map((c) => `${c.rol} ${c.hex}`).join(', ');
    if (colores) lineas.push(`Colores de la marca: ${colores}.`);
    if (ctx.kit.tono) lineas.push(`Tono: ${ctx.kit.tono}`);
    if (ctx.kit.palabrasProhibidas.length) {
      lineas.push(`Palabras que NUNCA debes usar: ${ctx.kit.palabrasProhibidas.join(', ')}.`);
    }
  } else {
    lineas.push(
      'Este proyecto todavía no tiene kit de marca. Si te piden una pieza, hazla igual y avísales que cargando su logo y sus colores en la sección Marca las piezas van a salir con su identidad.',
    );
  }

  if (!ctx.puedeOperar) {
    lineas.push(
      'Quien te está hablando solo puede MIRAR este proyecto: no publiques, no mandes mensajes y no cambies nada. Explícale lo que quiera saber y dile que le pida a quien manda en el proyecto que lo haga.',
    );
  }

  return lineas.join('\n');
}
