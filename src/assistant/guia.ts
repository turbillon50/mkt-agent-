/**
 * La guía activa.
 *
 * Goossip deja de esperar a que le pregunten. Estas reglas miran el proyecto y
 * dicen lo que hay que hacer HOY, en español y con un botón que lo hace.
 *
 * Tres reglas sobre las reglas, que es lo que separa esto de un tablero de
 * avisos que nadie lee:
 *
 *   1. CADA SUGERENCIA TRAE ACCIÓN. Si no hay un botón que la resuelva, no es
 *      una sugerencia: es un reproche. "Te falta conectar Facebook" sin el
 *      enlace a Conexiones es hacerle el trabajo al usuario de encontrar dónde.
 *   2. SE DICE EL COSTO, NO EL SÍNTOMA. "Te falta conectar Facebook" no mueve a
 *      nadie; "sin eso no entran leads" sí. La consecuencia es la mitad útil.
 *   3. SE ORDENAN POR LO QUE CUESTA IGNORARLAS. Un lead de ayer sin contestar
 *      cuesta dinero hoy; un kit de marca sin cargar cuesta piezas feas. No se
 *      pintan en el orden en que se le ocurrieron al programador.
 */
import { and, count, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { salesLeads, type Project, type ProjectBrandKit } from '../db/schema';
import { kitCompleto } from '../creative/brand-kit';
import { composioAccountsOf } from '../projects/composio-connections';
import { verificacionFresca } from '../projects/connections';
import { connectorBySlug } from '../projects/catalog';
import { listarPiezas } from '../creative/repo';

export type Urgencia = 'alta' | 'media' | 'baja';

export interface Sugerencia {
  id: string;
  /** Lo que se le dice al usuario, con la consecuencia dentro. */
  texto: string;
  urgencia: Urgencia;
  /** El botón. `href` navega; `prompt` se lo dicta al Asistente. */
  accion: { etiqueta: string; href?: string; prompt?: string };
}

export interface EstadoDelProyecto {
  conectados: string[];
  porReconectar: string[];
  kitCompleto: boolean;
  leadsSinContactar: number;
  piezasSinDecidir: number;
  sugerencias: Sugerencia[];
}

const PESO: Record<Urgencia, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Los canales que le dan sentido a Goossip. Si un proyecto no tiene NINGUNO de
 * estos, la app no puede hacer su trabajo y eso se dice el primer día, no
 * cuando el cliente pregunte por qué no pasa nada.
 */
const CANALES_QUE_TRAEN_GENTE = ['facebook', 'instagram', 'linkedin', 'whatsapp'];

export async function pendientesDelProyecto(input: {
  orgId: string;
  project: Project;
  kit: ProjectBrandKit | null;
}): Promise<EstadoDelProyecto> {
  const { orgId, project, kit } = input;
  const base = `/projects/${project.id}`;

  const [cuentas, leads, piezas] = await Promise.all([
    composioAccountsOf(project).catch(() => []),
    leadsSinContactar(orgId, project.id).catch(() => 0),
    listarPiezas(orgId, project.id, { estado: 'propuesta', limite: 50 }).catch(() => []),
  ]);

  const conectados: string[] = [];
  const porReconectar: string[] = [];
  for (const c of cuentas) {
    const etiqueta = connectorBySlug(c.platform)?.label ?? c.platform;
    if (c.status === 'connected' && verificacionFresca(c.verifiedAt)) conectados.push(etiqueta);
    else if (c.status === 'connected' || c.status === 'needs_reconnect') porReconectar.push(etiqueta);
  }

  const completo = kitCompleto(kit);
  const sugerencias: Sugerencia[] = [];

  // --- lo que cuesta dinero hoy -------------------------------------------
  if (leads > 0) {
    sugerencias.push({
      id: 'leads-sin-contactar',
      texto:
        leads === 1
          ? 'Hay 1 lead sin contactar. Un lead que espera más de un día se enfría.'
          : `Hay ${leads} leads sin contactar. Un lead que espera más de un día se enfría.`,
      urgencia: 'alta',
      accion: { etiqueta: 'Ver los leads', href: `${base}/leads` },
    });
  }

  if (porReconectar.length) {
    sugerencias.push({
      id: 'reconectar',
      texto: `${porReconectar.join(' y ')} dejó de responder. Mientras esté así, por ahí no sale ni entra nada.`,
      urgencia: 'alta',
      accion: { etiqueta: 'Reconectar', href: `${base}/conexiones` },
    });
  }

  // --- lo que impide que Goossip trabaje ----------------------------------
  const traeGente = cuentas.some(
    (c) => CANALES_QUE_TRAEN_GENTE.includes(c.platform) && c.status === 'connected',
  );
  if (!traeGente) {
    sugerencias.push({
      id: 'sin-canales',
      texto:
        'Todavía no hay ningún canal conectado. Sin eso no entran leads y no se puede publicar con la cuenta de este cliente.',
      urgencia: 'alta',
      accion: { etiqueta: 'Conectar un canal', href: `${base}/conexiones` },
    });
  }

  if (!completo) {
    sugerencias.push({
      id: 'sin-kit',
      texto:
        'Este proyecto no tiene kit de marca. Las piezas van a salir genéricas: sin su logo y sin sus colores.',
      urgencia: 'media',
      accion: { etiqueta: 'Cargar la marca', href: `${base}/marca` },
    });
  }

  // --- lo que ya está hecho y falta cerrar --------------------------------
  if (piezas.length > 0) {
    sugerencias.push({
      id: 'piezas-sin-decidir',
      texto:
        piezas.length === 1
          ? 'Hay 1 pieza esperando que elijas si sirve o no.'
          : `Hay ${piezas.length} piezas esperando que elijas cuáles sirven.`,
      urgencia: 'media',
      accion: { etiqueta: 'Ver las piezas', href: `${base}/contenido` },
    });
  }

  // --- lo que mejora lo que ya funciona -----------------------------------
  if (conectados.length > 0 && completo && piezas.length === 0) {
    sugerencias.push({
      id: 'haz-contenido',
      texto: `Tus canales están al día y tu marca cargada. ¿Sacamos la publicación de esta semana?`,
      urgencia: 'baja',
      accion: {
        etiqueta: 'Hazme una pieza',
        prompt: `Hazme la publicación de esta semana para ${conectados[0]} de ${project.name}, con su pieza.`,
      },
    });
  }

  sugerencias.sort((a, b) => PESO[a.urgencia] - PESO[b.urgencia]);

  return {
    conectados,
    porReconectar,
    kitCompleto: completo,
    leadsSinContactar: leads,
    piezasSinDecidir: piezas.length,
    sugerencias,
  };
}

/**
 * Leads que llevan más de un día en "nuevo".
 *
 * Es "más de un día" y no "ninguno contactado": un lead que entró hace diez
 * minutos no es un descuido, y avisar de él enseña a ignorar los avisos.
 */
async function leadsSinContactar(orgId: string, projectId: string): Promise<number> {
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [fila] = await db
    .select({ n: count() })
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, orgId),
        eq(salesLeads.campaignId, projectId),
        inArray(salesLeads.stage, ['nuevo']),
        lt(salesLeads.createdAt, ayer),
      ),
    );
  return Number(fila?.n ?? 0);
}

/**
 * Lo que la guía le cuenta al MODELO, no a la pantalla.
 *
 * Va dentro de las instrucciones del Asistente para que no tenga que llamar a
 * una tool solo para saber que al proyecto le falta conectar Facebook: si lo
 * sabe de entrada, lo puede mencionar cuando toque en vez de cuando se lo
 * pregunten.
 */
export function guiaComoTexto(e: EstadoDelProyecto): string {
  if (e.sugerencias.length === 0) return 'Este proyecto está al día: no hay nada pendiente.';
  return [
    'Lo que este proyecto tiene pendiente ahora mismo:',
    ...e.sugerencias.map((s) => `· ${s.texto}`),
    'Si viene a cuento, dilo. No lo sueltes todo de golpe ni lo repitas cada mensaje.',
  ].join('\n');
}
