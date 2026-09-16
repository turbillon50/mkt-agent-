/**
 * Lo común a todos los adaptadores de canal.
 *
 * Un adaptador NO habla con la API del proveedor: habla con Composio con el
 * `user_id` del PROYECTO. Así ninguna acción de Goossip necesita un token
 * nuestro ni una app de developer propia, y la cuenta que se usa es siempre la
 * que el cliente autorizó para ESE proyecto.
 *
 * Regla de la corrida 5: si no hay cuenta viva, la acción NO se intenta y se
 * dice en español qué falta. Fallar con el 401 crudo del proveedor es lo que
 * había antes y es lo que no se entiende.
 */
import type { Project } from '../db/schema';
import { executeTool, executeToolWithFiles, proxyExecute, proxyExecuteFull, type ToolResult } from '../composio/client';
import { activeAccountFor, verifyAccount } from '../projects/composio-connections';
import { composioAccountsOf } from '../projects/composio-connections';
import { connectorOrThrow } from '../projects/catalog';

export class CanalNoConectado extends Error {
  constructor(readonly toolkit: string) {
    super(`Conecta ${connectorOrThrow(toolkit).label} en Conexiones para poder hacer esto.`);
    this.name = 'CanalNoConectado';
  }
}

export interface Cuenta {
  connectedAccountId: string;
  userId: string;
}

export async function cuentaDe(project: Project, toolkit: string): Promise<Cuenta> {
  const cuenta = await activeAccountFor(project, toolkit);
  if (!cuenta) throw new CanalNoConectado(toolkit);
  return cuenta;
}

/**
 * El cuerpo útil de una respuesta de Composio.
 *
 * Los toolkits devuelven el objeto envuelto y no siempre con el mismo nombre:
 * unos usan `response_data`, otros `response_dict`, otros lo mandan pelón.
 * Sin esto, leer `data.records` de Airtable da `undefined` y la importación
 * trae cero documentos sin que nadie se entere — pasó en la corrida 5.
 *
 * `response_dict` se sumó en la corrida 6 y NO es cosmético: es el envoltorio
 * que usa LinkedIn. Con solo `response_data`, `LINKEDIN_GET_MY_INFO` devolvía
 * un objeto donde no estaba el autor, y publicar en LinkedIn moría con
 * "No se pudo leer tu identidad. Vuelve a conectarlo." — un mensaje que manda
 * al usuario a reconectar una cuenta que estaba perfectamente conectada. Solo
 * se ve publicando de verdad, y por eso no salió hasta esta corrida.
 */
export function cuerpo<T = any>(data: any): T {
  return (data?.response_data ?? data?.response_dict ?? data) as T;
}

/** Ejecuta una tool de Composio con la cuenta del proyecto. */
export async function run<T = any>(
  project: Project,
  toolkit: string,
  slug: string,
  args: Record<string, unknown> = {},
  version?: string,
): Promise<T> {
  const cuenta = await cuentaDe(project, toolkit);
  const res: ToolResult<T> = await executeTool<T>(slug, {
    userId: cuenta.userId,
    connectedAccountId: cuenta.connectedAccountId,
    arguments: args,
    version,
  });
  return (res.data ?? res) as T;
}

/** Ejecuta una tool que recibe una URL pública como archivo. */
export async function runWithFiles<T = any>(
  project: Project,
  toolkit: string,
  slug: string,
  args: Record<string, unknown> = {},
  version?: string,
): Promise<T> {
  const cuenta = await cuentaDe(project, toolkit);
  const res: ToolResult<T> = await executeToolWithFiles<T>(slug, {
    userId: cuenta.userId,
    connectedAccountId: cuenta.connectedAccountId,
    arguments: args,
    version,
  });
  return (res.data ?? res) as T;
}

/**
 * Llamada cruda a la API del proveedor con las credenciales que pone Composio.
 * Solo donde el toolkit no trae tool para lo que Goossip necesita — hoy:
 * formularios de lead ads de Facebook y el `search` de Google Ads.
 */
export async function proxy(
  project: Project,
  toolkit: string,
  input: {
    endpoint: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>;
  },
): Promise<any> {
  const cuenta = await cuentaDe(project, toolkit);
  return proxyExecute({ connectedAccountId: cuenta.connectedAccountId, ...input });
}

/**
 * Igual, pero con los ENCABEZADOS que devolvió el proveedor.
 *
 * Existe por LinkedIn: al publicar contesta el cuerpo vacío y el id del post
 * en `x-restli-id`. Con la versión de arriba, la publicación salía bien y
 * Goossip no sabía dónde había quedado.
 */
export async function proxyConEncabezados(
  project: Project,
  toolkit: string,
  input: {
    endpoint: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>;
  },
): Promise<{ data: any; headers: Record<string, string> }> {
  const cuenta = await cuentaDe(project, toolkit);
  const r = await proxyExecuteFull({ connectedAccountId: cuenta.connectedAccountId, ...input });
  return { data: r.data, headers: r.headers };
}

export interface ChannelStatus {
  toolkit: string;
  conectado: boolean;
  estado: string;
  motivo?: string;
}

/**
 * `verify()` de un canal: le pregunta a Composio, no a nuestra base. Preguntar
 * a la base contesta lo que nosotros escribimos la última vez, no lo que pasa
 * en la cuenta del cliente.
 */
export async function verifyChannel(project: Project, toolkit: string): Promise<ChannelStatus> {
  const cuentas = await composioAccountsOf(project);
  const fila = cuentas.find((c) => c.platform === toolkit);
  if (!fila) return { toolkit, conectado: false, estado: 'SIN_CONECTAR' };
  const r = await verifyAccount(project, fila);
  return { toolkit, conectado: r.ok, estado: r.status, motivo: r.motivo };
}

/** Lo que devuelve cualquier acción de publicar. */
export interface PublishInput {
  texto: string;
  /** URL pública de la imagen o el video, cuando el canal lo admite. */
  media?: string | null;
  /** Enlace que acompaña al texto (Facebook, LinkedIn). */
  link?: string | null;
  /** Id de la página, canal o cuenta cuando el canal pide elegir. */
  target?: string | null;
}

export interface PublishResult {
  toolkit: string;
  id: string | null;
  url: string | null;
}

export interface KnowledgeDoc {
  id: string;
  titulo: string;
  contenido: string;
  fuente: string;
}

export interface ChannelAdapter {
  toolkit: string;
  /** Siempre: ¿sigue viva la cuenta del proyecto? */
  verify(project: Project): Promise<ChannelStatus>;
  /** Publicar un post. */
  publish?(project: Project, input: PublishInput): Promise<PublishResult>;
  /** Leer campañas, gasto y resultados de pauta. */
  readCampaigns?(project: Project, input?: Record<string, unknown>): Promise<unknown>;
  /** Leer filas o registros (hojas, bases). */
  readRows?(project: Project, input: Record<string, unknown>): Promise<unknown>;
  /** Traer documentos para la base de conocimiento. */
  readDocs?(project: Project, input?: Record<string, unknown>): Promise<KnowledgeDoc[]>;
  /** Contactos del CRM, en los dos sentidos. */
  readContacts?(project: Project, input?: Record<string, unknown>): Promise<unknown>;
  writeContact?(project: Project, input: Record<string, unknown>): Promise<unknown>;
  /** Agenda. */
  createEvent?(project: Project, input: Record<string, unknown>): Promise<unknown>;
  /** Correo. */
  sendEmail?(project: Project, input: { to: string; subject: string; body: string; html?: boolean }): Promise<unknown>;
  /** Aviso al equipo. */
  notify?(project: Project, input: { canal: string; texto: string }): Promise<unknown>;
  /** Leads de formularios de anuncios. */
  fetchLeads?(project: Project, input: { formIds: string[]; desde?: Date }): Promise<RawLead[]>;
}

/** Un lead tal como lo devuelve el proveedor, antes de entrar al pipeline. */
export interface RawLead {
  leadgenId: string;
  formId: string;
  createdAt: Date;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  raw: Record<string, unknown>;
}
