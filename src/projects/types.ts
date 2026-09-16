/**
 * El proyecto como unidad central: quién entra, qué puede tocar y qué canales
 * cuelgan de él.
 *
 * Vive en src/ (no en lib/) por la misma razón que el resto: las pruebas y los
 * scripts de tsx lo usan fuera de Next, y `server-only` los revienta.
 *
 * Dos sistemas de roles conviven y NO son el mismo:
 *   · el de la ORGANIZACIÓN (Clerk): `org:owner` / `org:admin` / `org:member`.
 *   · el del PROYECTO (esta tabla): dueño / editor / conector / lector.
 * El primero dice de qué tenant eres; el segundo, qué proyecto ves y qué haces
 * dentro. Un `org:admin` es dueño implícito de todos los proyectos de su org.
 */

// ---------------------------------------------------------------------------
// Roles del proyecto
// ---------------------------------------------------------------------------

export const PROJECT_ROLES = ['dueño', 'editor', 'conector', 'lector'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_MEMBER_STATUSES = ['invitado', 'activo'] as const;
export type ProjectMemberStatus = (typeof PROJECT_MEMBER_STATUSES)[number];

export function isProjectRole(value: unknown): value is ProjectRole {
  return PROJECT_ROLES.includes(value as ProjectRole);
}

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  dueño: 'Dueño',
  editor: 'Editor',
  conector: 'Conector',
  lector: 'Lector',
};

export const PROJECT_ROLE_HELP: Record<ProjectRole, string> = {
  dueño: 'Manda en el proyecto: invita gente, conecta canales y cambia los ajustes.',
  editor: 'Atiende leads, conversaciones y contenido. No toca canales ni el equipo.',
  conector: 'Solo conecta y desconecta canales. No ve leads ni conversaciones.',
  lector: 'Mira todo el proyecto sin cambiar nada.',
};

// ---------------------------------------------------------------------------
// Secciones del proyecto
// ---------------------------------------------------------------------------

export const PROJECT_SECTIONS = [
  'inicio',
  'leads',
  'conversaciones',
  'campanas',
  'contenido',
  // Corrida 6. Va junto a Contenido y no bajo "Proyecto" porque el kit de
  // marca se toca todo el tiempo mientras se hacen piezas, no una vez al dar
  // de alta el proyecto.
  'marca',
  'automatizaciones',
  'conocimiento',
  'conexiones',
  'equipo',
  'ajustes',
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

export const PROJECT_SECTION_LABEL: Record<ProjectSection, string> = {
  inicio: 'Inicio',
  leads: 'Leads',
  conversaciones: 'Conversaciones',
  campanas: 'Campañas',
  contenido: 'Contenido',
  marca: 'Marca',
  automatizaciones: 'Automatizaciones',
  conocimiento: 'Conocimiento',
  conexiones: 'Conexiones',
  equipo: 'Equipo',
  ajustes: 'Ajustes',
};

/** Las que solo manda el dueño del proyecto. */
const OWNER_ONLY: ReadonlySet<ProjectSection> = new Set<ProjectSection>(['equipo', 'ajustes']);

/**
 * Qué secciones ve cada rol.
 *
 * El `conector` ve UNA: Conexiones. Es el caso del community manager del
 * cliente, que entra a enganchar su Facebook y no tiene por qué ver los leads
 * de nadie. Todo lo demás le contesta 403 — esconder el link no es protección.
 */
export function canSeeSection(role: ProjectRole, section: ProjectSection): boolean {
  if (role === 'dueño') return true;
  if (role === 'conector') return section === 'conexiones';
  return !OWNER_ONLY.has(section);
}

export function sectionsFor(role: ProjectRole): ProjectSection[] {
  return PROJECT_SECTIONS.filter((s) => canSeeSection(role, s));
}

/** A dónde cae alguien que entra al proyecto sin pedir sección. */
export function landingSection(role: ProjectRole): ProjectSection {
  return role === 'conector' ? 'conexiones' : 'inicio';
}

// ---------------------------------------------------------------------------
// Qué puede hacer cada rol
// ---------------------------------------------------------------------------

export type ProjectCapability =
  /** Ver el proyecto (alguna sección). */
  | 'ver'
  /** Mover leads, contestar, publicar, aprobar acciones. */
  | 'operar'
  /** Conectar y revocar canales. */
  | 'conectar'
  /** Invitar, cambiar roles, editar ajustes, borrar el proyecto. */
  | 'administrar';

const CAPABILITIES: Record<ProjectRole, ReadonlySet<ProjectCapability>> = {
  dueño: new Set<ProjectCapability>(['ver', 'operar', 'conectar', 'administrar']),
  editor: new Set<ProjectCapability>(['ver', 'operar']),
  conector: new Set<ProjectCapability>(['ver', 'conectar']),
  lector: new Set<ProjectCapability>(['ver']),
};

export function projectCan(role: ProjectRole, capability: ProjectCapability): boolean {
  return CAPABILITIES[role].has(capability);
}

// ---------------------------------------------------------------------------
// Bitácora del proyecto
// ---------------------------------------------------------------------------

export const PROJECT_EVENT_TYPES = [
  'project_created',
  'project_updated',
  'channel_connected',
  'channel_revoked',
  'member_invited',
  'member_joined',
  'member_role_changed',
  'member_removed',
  'link_created',
  'link_used',
  'link_revoked',
  // Campañas del proyecto (0015). `project_events.type` es texto libre en la
  // base, así que sumarlos no pide migración.
  'campaign_created',
  'campaign_updated',
  'campaign_deleted',
] as const;
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export const PROJECT_EVENT_LABEL: Record<ProjectEventType, string> = {
  project_created: 'Proyecto creado',
  project_updated: 'Ajustes del proyecto',
  channel_connected: 'Canal conectado',
  channel_revoked: 'Canal desconectado',
  member_invited: 'Invitación enviada',
  member_joined: 'Alguien entró al proyecto',
  member_role_changed: 'Cambio de rol',
  member_removed: 'Alguien salió del proyecto',
  link_created: 'Enlace de conexión creado',
  link_used: 'Enlace de conexión usado',
  link_revoked: 'Enlace de conexión cancelado',
  campaign_created: 'Campaña creada',
  campaign_updated: 'Campaña editada',
  campaign_deleted: 'Campaña borrada',
};

// ---------------------------------------------------------------------------
// Canales del proyecto
// ---------------------------------------------------------------------------

/**
 * El catálogo vive en `catalog.ts` desde la corrida 5 — una sola lista con los
 * 21 conectores de Composio y los tres propios de Goossip. Aquí solo se
 * reexporta lo que el resto de la app ya nombraba así, para que agregar un
 * conector siga siendo tocar UN archivo.
 */
export {
  CONNECTORS,
  CONNECTOR_GROUPS,
  CONNECTOR_GROUP_LABEL,
  CONNECTOR_GROUP_BLURB,
  activeConnectors,
  connectorBySlug,
  connectorMode,
  connectorShareable,
  connectorOrThrow as channelSpec,
  isCatalogSlug as isConnectionChannel,
  metaOwnAppEnabled,
  defaultLogo,
  type Connector,
  type ConnectorGroup,
  type ConnectionMode,
} from './catalog';
import type { ConnectorSlug } from './catalog';

/** El canal de una conexión: un slug del catálogo. */
export type ConnectionChannel = ConnectorSlug;

/**
 * UN solo sistema de etiquetas en toda la app. La corrida 5 suma `reconectar`,
 * que no es cosmético: una cuenta que el cliente revocó desde Facebook no está
 * "sin conectar" —hubo algo y se cayó— y pintarla igual que una que nunca se
 * enganchó esconde justo el problema que hay que arreglar.
 */
export const CONNECTION_STATES = [
  'conectado',
  'sin_conectar',
  'reconectar',
  'proximamente',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  conectado: 'Conectado',
  sin_conectar: 'Sin conectar',
  reconectar: 'Reconectar',
  proximamente: 'Próximamente',
};
