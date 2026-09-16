/**
 * Lo que se puede mencionar con `@` dentro de un proyecto.
 *
 * Cuatro tipos, y los cuatro salen de la BASE del proyecto: leads, campañas,
 * conexiones y piezas. Eso es lo que hace útil la mención — `@` no sirve para
 * decorar el texto, sirve para que el modelo reciba el DATO en vez del nombre.
 * Mencionar "@Ana Gómez" y que Goossip tenga que adivinar quién es Ana sería
 * el mismo chat de antes con un adorno.
 *
 * Nada de esto acepta un `projectId` de fuera: llega desde la ruta, que ya pasó
 * por la puerta del proyecto. Es la misma regla de `project-tools.ts`.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { creativePieces, marketingCampaigns, salesLeads, type Project } from '../db/schema';
import { composioAccountsOf } from '../projects/composio-connections';
import { connectorBySlug } from '../projects/catalog';

export type TipoMencion = 'lead' | 'campaña' | 'conexión' | 'pieza';

export interface Mencion {
  tipo: TipoMencion;
  id: string;
  /** Lo que se ve en el chip y lo que se escribe en el texto. */
  etiqueta: string;
  /** El renglón chiquito de abajo: teléfono, estado, red. */
  detalle: string | null;
}

const POR_TIPO = 5;

export async function buscarMenciones(
  project: Project,
  orgId: string,
  q: string,
): Promise<Mencion[]> {
  const termino = q.trim();
  const patron = `%${termino}%`;

  const [leads, campanas, conexiones, piezas] = await Promise.all([
    buscarLeads(project.id, orgId, termino, patron),
    buscarCampanas(project.id, termino, patron),
    buscarConexiones(project, termino),
    buscarPiezas(project.id, termino, patron),
  ]);

  // El orden es el de utilidad, no el alfabético: quien escribe `@` casi
  // siempre va por un lead. Las piezas son las que menos se mencionan y por eso
  // van al final.
  return [...leads, ...campanas, ...conexiones, ...piezas];
}

async function buscarLeads(
  projectId: string,
  orgId: string,
  termino: string,
  patron: string,
): Promise<Mencion[]> {
  const filtro = and(
    eq(salesLeads.campaignId, projectId),
    eq(salesLeads.orgId, orgId),
    termino
      ? or(
          ilike(salesLeads.fullName, patron),
          ilike(salesLeads.phone, patron),
          ilike(salesLeads.email, patron),
        )
      : sql`true`,
  );
  const filas = await db
    .select({
      id: salesLeads.id,
      fullName: salesLeads.fullName,
      phone: salesLeads.phone,
      email: salesLeads.email,
      stage: salesLeads.stage,
      grade: salesLeads.grade,
    })
    .from(salesLeads)
    .where(filtro)
    .orderBy(desc(salesLeads.createdAt))
    .limit(POR_TIPO);

  return filas.map((l) => ({
    tipo: 'lead' as const,
    id: l.id,
    // Un lead sin nombre es la mitad de los que entran por formulario. Se
    // enseña su teléfono, que es con lo que se le va a hablar de todas formas.
    etiqueta: l.fullName?.trim() || l.phone || l.email || 'Lead sin nombre',
    detalle: [l.stage, l.grade ? `grado ${l.grade}` : null, l.fullName ? l.phone : null]
      .filter(Boolean)
      .join(' · '),
  }));
}

async function buscarCampanas(
  projectId: string,
  termino: string,
  patron: string,
): Promise<Mencion[]> {
  const filas = await db
    .select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      status: marketingCampaigns.status,
      objective: marketingCampaigns.objective,
    })
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.projectId, projectId),
        termino ? ilike(marketingCampaigns.name, patron) : sql`true`,
      ),
    )
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(POR_TIPO);

  return filas.map((c) => ({
    tipo: 'campaña' as const,
    id: c.id,
    etiqueta: c.name,
    detalle: `${c.status} · ${c.objective}`,
  }));
}

async function buscarConexiones(project: Project, termino: string): Promise<Mencion[]> {
  const cuentas = await composioAccountsOf(project).catch(() => []);
  const t = termino.toLowerCase();
  return cuentas
    .filter((c) => {
      const etiqueta = connectorBySlug(c.platform)?.label ?? c.platform;
      return !t || etiqueta.toLowerCase().includes(t) || c.platform.toLowerCase().includes(t);
    })
    .slice(0, POR_TIPO)
    .map((c) => ({
      tipo: 'conexión' as const,
      id: c.platform,
      etiqueta: connectorBySlug(c.platform)?.label ?? c.platform,
      detalle: c.status === 'connected' ? 'conectada' : c.status,
    }));
}

async function buscarPiezas(
  projectId: string,
  termino: string,
  patron: string,
): Promise<Mencion[]> {
  const filas = await db
    .select({
      id: creativePieces.id,
      brief: creativePieces.brief,
      red: creativePieces.red,
      formato: creativePieces.formato,
      estado: creativePieces.estado,
    })
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.projectId, projectId),
        termino ? ilike(creativePieces.brief, patron) : sql`true`,
      ),
    )
    .orderBy(desc(creativePieces.createdAt))
    .limit(POR_TIPO);

  return filas.map((p) => ({
    tipo: 'pieza' as const,
    id: p.id,
    etiqueta: p.brief.length > 40 ? `${p.brief.slice(0, 40)}…` : p.brief,
    detalle: `${p.red} ${p.formato} · ${p.estado}`,
  }));
}

/**
 * Lo que se le pone al modelo cuando el turno traía menciones.
 *
 * Se vuelve a leer de la base en el momento de contestar y no se confía en lo
 * que mandó el navegador: entre que alguien escribió `@Ana` y le dio enviar,
 * Ana pudo cambiar de etapa. Y un id que no es de este proyecto simplemente no
 * aparece, sin decir por qué: confirmar que existe ya es filtrar.
 */
export async function contextoDeMenciones(
  project: Project,
  orgId: string,
  menciones: Array<{ tipo: string; id: string }>,
): Promise<string | null> {
  if (!menciones.length) return null;
  const lineas: string[] = [];

  for (const m of menciones.slice(0, 10)) {
    if (m.tipo === 'lead') {
      const [l] = await db
        .select()
        .from(salesLeads)
        .where(and(eq(salesLeads.id, m.id), eq(salesLeads.campaignId, project.id), eq(salesLeads.orgId, orgId)))
        .limit(1);
      if (l) {
        lineas.push(
          `- Lead ${l.fullName ?? '(sin nombre)'} · tel ${l.phone ?? '—'} · correo ${l.email ?? '—'} · etapa ${l.stage} · grado ${l.grade} · llegó por ${l.source} el ${l.createdAt.toISOString().slice(0, 10)}.`,
        );
      }
    } else if (m.tipo === 'campaña') {
      const [c] = await db
        .select()
        .from(marketingCampaigns)
        .where(and(eq(marketingCampaigns.id, m.id), eq(marketingCampaigns.projectId, project.id)))
        .limit(1);
      if (c) {
        lineas.push(
          `- Campaña "${c.name}" · objetivo ${c.objective} · estado ${c.status} · canales ${c.channels.join(', ') || '—'} · presupuesto ${c.budget ?? '—'}.`,
        );
      }
    } else if (m.tipo === 'pieza') {
      const [p] = await db
        .select()
        .from(creativePieces)
        .where(and(eq(creativePieces.id, m.id), eq(creativePieces.projectId, project.id)))
        .limit(1);
      if (p) {
        lineas.push(
          `- Pieza para ${p.red} (${p.formato}), estado ${p.estado}. Brief: ${p.brief}. Está en ${p.url ?? 'sin URL'}.`,
        );
      }
    } else if (m.tipo === 'conexión') {
      const cuentas = await composioAccountsOf(project).catch(() => []);
      const c = cuentas.find((x) => x.platform === m.id);
      if (c) {
        lineas.push(
          `- Conexión ${connectorBySlug(c.platform)?.label ?? c.platform}: ${c.status}${c.externalHandle ? ` (${c.externalHandle})` : ''}.`,
        );
      }
    }
  }

  if (!lineas.length) return null;
  return `## Lo que el usuario mencionó con @\n\n${lineas.join('\n')}`;
}
