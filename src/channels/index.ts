/**
 * El registro de canales.
 *
 * Toda acción de Goossip contra un tercero entra por aquí: publicar, leer
 * campañas, leer filas, agendar, escribir un correo, avisar al equipo. Ninguna
 * pantalla ni ningún agente llama a la API de un proveedor por su cuenta.
 *
 * Por qué importa: con `META_OWN_APP=false` nadie debe estar llamando a Graph
 * con un token nuestro. Si la única puerta es esta, la regla se cumple sola.
 */
import type { Project } from '../db/schema';
import { metaOwnAppEnabled } from '../projects/catalog';
import { facebook, instagram, linkedin, tiktok, twitter, youtube } from './publicacion';
import { googleads, metaads } from './pauta';
import { airtable, googledrive, googlesheets, hubspot, notion } from './conocimiento';
import { gmail, googlecalendar, slack } from './operacion';
import type { ChannelAdapter, PublishInput, PublishResult } from './base';

export * from './base';
export { listLeadForms, normalizaLead } from './publicacion';

export const ADAPTERS: Record<string, ChannelAdapter> = {
  facebook,
  instagram,
  linkedin,
  twitter,
  tiktok,
  youtube,
  metaads,
  googleads,
  googlesheets,
  airtable,
  notion,
  googledrive,
  hubspot,
  googlecalendar,
  gmail,
  slack,
};

export function adapterFor(toolkit: string): ChannelAdapter | null {
  return ADAPTERS[toolkit] ?? null;
}

export function adapterOrThrow(toolkit: string): ChannelAdapter {
  const a = adapterFor(toolkit);
  if (!a) throw new Error(`No hay adaptador para ${toolkit}.`);
  return a;
}

/** Los canales por los que se puede publicar un post. */
export const CANALES_DE_PUBLICACION = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
] as const;

export async function publishTo(
  project: Project,
  toolkit: string,
  input: PublishInput,
): Promise<PublishResult> {
  const adapter = adapterOrThrow(toolkit);
  if (!adapter.publish) throw new Error(`Por ${toolkit} no se publica.`);
  return adapter.publish(project, input);
}

/**
 * ¿Los leads de Meta entran por Composio o por la app propia?
 *
 * Con la bandera apagada (lo normal desde la corrida 5) la respuesta es
 * Composio, y nada llama a Graph con credenciales nuestras.
 */
export function leadsPorComposio(): boolean {
  return !metaOwnAppEnabled();
}
