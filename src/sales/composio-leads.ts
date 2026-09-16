/**
 * Los leads de Meta, por Composio.
 *
 * Hasta la corrida 3 los leads entraban SOLO por el webhook de nuestra app de
 * Meta: para recibir uno había que dar de alta la app, el webhook y la página.
 * Un proyecto nuevo no recibía nada hasta que alguien de Goossip movía cosas en
 * el panel de Facebook.
 *
 * Aquí se agrega el otro camino: cada 5 minutos se le preguntan los leads a los
 * formularios del proyecto con la cuenta que el cliente autorizó en Composio.
 * Los dos caminos escriben con `source='meta_leadgen'` y `sourceRef=<leadgen_id>`,
 * que es la llave con la que `upsertLead` deduplica desde la corrida 1 — así el
 * webhook y el poll pueden traer el mismo lead sin duplicarlo.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { salesLeads, type Project } from '../db/schema';
import { facebook, listLeadForms } from '../channels/publicacion';
import { activeAccountFor } from '../projects/composio-connections';
import { ingestLead } from './ingest';
import type { ProjectChannels } from './types';

/** Cuánto hacia atrás se mira la primera vez que un proyecto se asoma. */
const PRIMERA_VENTANA_DIAS = 7;

export interface PollResult {
  projectId: string;
  formularios: string[];
  revisados: number;
  nuevos: number;
  repetidos: number;
  error?: string;
}

/**
 * Desde cuándo pedir. Se toma la fecha del lead más reciente que ya tenemos de
 * esa fuente y se retrocede un minuto: pedir "desde el último" exacto se come
 * los que entraron en el mismo segundo.
 */
export async function desdeCuando(project: Project): Promise<Date> {
  const rows = await db
    .select({ createdAt: salesLeads.createdAt })
    .from(salesLeads)
    .where(and(eq(salesLeads.campaignId, project.id), eq(salesLeads.source, 'meta_leadgen')))
    .orderBy(desc(salesLeads.createdAt))
    .limit(1);
  const ultimo = rows[0]?.createdAt;
  if (ultimo) return new Date(ultimo.getTime() - 60_000);
  return new Date(Date.now() - PRIMERA_VENTANA_DIAS * 24 * 60 * 60 * 1000);
}

/**
 * Los formularios que hay que mirar.
 *
 * Primero los que el proyecto tenga elegidos; si no eligió ninguno, se
 * descubren solos desde las páginas de la cuenta conectada. Eso es lo que hace
 * que un proyecto recién creado reciba leads sin que nadie configure nada.
 */
export async function formulariosDe(project: Project): Promise<string[]> {
  const channels = (project.channels ?? {}) as ProjectChannels;
  const elegidos = (channels.meta_form_ids ?? []).filter(Boolean);
  if (elegidos.length > 0) return elegidos;

  const paginas: any = await facebook.readCampaigns?.(project).catch(() => null);
  const lista: any[] = paginas?.data ?? paginas?.pages ?? [];
  const out: string[] = [];
  for (const p of lista.slice(0, 5)) {
    const forms = await listLeadForms(project, String(p.id)).catch(() => []);
    for (const f of forms) if (f.status === 'ACTIVE' || !f.status) out.push(f.id);
  }
  return out;
}

/** Una pasada para un proyecto. Nunca lanza: devuelve el error como dato. */
export async function pollProject(project: Project): Promise<PollResult> {
  const base: PollResult = {
    projectId: project.id,
    formularios: [],
    revisados: 0,
    nuevos: 0,
    repetidos: 0,
  };

  const cuenta = await activeAccountFor(project, 'facebook').catch(() => null);
  if (!cuenta) return base; // el proyecto no conectó Facebook: no hay nada que mirar

  try {
    const formIds = await formulariosDe(project);
    if (formIds.length === 0) return { ...base, formularios: [] };

    const desde = await desdeCuando(project);
    const leads = (await facebook.fetchLeads?.(project, { formIds, desde })) ?? [];

    let nuevos = 0;
    let repetidos = 0;
    for (const lead of leads) {
      if (!lead.leadgenId) continue;
      const r = await ingestLead({
        project,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        source: 'meta_leadgen',
        // La llave del dedupe. El webhook escribe exactamente la misma.
        sourceRef: lead.leadgenId,
        createdAt: lead.createdAt,
        raw: { ...lead.raw, via: 'composio' },
      });
      if (r.created) nuevos += 1;
      else repetidos += 1;
    }

    return { ...base, formularios: formIds, revisados: leads.length, nuevos, repetidos };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'no se pudo leer los leads' };
  }
}
