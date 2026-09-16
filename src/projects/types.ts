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
 * Orden por VALOR para quien vende, no por orden alfabético ni por cuál fue más
 * fácil de programar: Meta trae los leads, WhatsApp los atiende, y de ahí para
 * abajo.
 */
export const CONNECTION_CHANNELS = [
  'meta',
  'whatsapp',
  'google',
  'linkedin',
  'x',
  'tiktok',
  'sitio',
  'mcp',
] as const;
export type ConnectionChannel = (typeof CONNECTION_CHANNELS)[number];

export function isConnectionChannel(value: unknown): value is ConnectionChannel {
  return CONNECTION_CHANNELS.includes(value as ConnectionChannel);
}

/**
 * Cómo se conecta cada canal:
 *   oauth     — el usuario da permiso en la ventana del proveedor
 *   datos     — el usuario escribe un id público (WhatsApp, MCP)
 *   automatico— Goossip genera la conexión sola (el webhook del sitio)
 */
export type ConnectionMode = 'oauth' | 'datos' | 'automatico';

export interface ChannelSpec {
  id: ConnectionChannel;
  /** Lo que lee el usuario. Nada de nombres internos. */
  label: string;
  /** Una línea en español, sin jerga de desarrollo. */
  description: string;
  mode: ConnectionMode;
  /** Se puede compartir por enlace de conexión a alguien de fuera. */
  shareable: boolean;
}

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    id: 'meta',
    label: 'Facebook e Instagram',
    description: 'Tus páginas y los formularios de anuncios. De aquí entran los leads.',
    mode: 'oauth',
    shareable: true,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'El número por el que tu vendedor contesta.',
    mode: 'datos',
    shareable: false,
  },
  {
    id: 'google',
    label: 'Google',
    description: 'Correo y calendario para agendar citas.',
    mode: 'oauth',
    shareable: true,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    description: 'Tu perfil o la página de la empresa.',
    mode: 'oauth',
    shareable: true,
  },
  {
    id: 'x',
    label: 'X',
    description: 'La cuenta con la que publicas.',
    mode: 'oauth',
    shareable: true,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'La cuenta con la que publicas.',
    mode: 'oauth',
    shareable: true,
  },
  {
    id: 'sitio',
    label: 'Tu sitio web',
    description: 'Los formularios de tu página entran directo al pipeline.',
    mode: 'automatico',
    shareable: false,
  },
  {
    id: 'mcp',
    label: 'Tu catálogo',
    description: 'Para que el vendedor cotice con precios y unidades reales.',
    mode: 'datos',
    shareable: false,
  },
];

export function channelSpec(id: ConnectionChannel): ChannelSpec {
  const spec = CHANNEL_SPECS.find((c) => c.id === id);
  if (!spec) throw new Error(`Canal desconocido: ${id}`);
  return spec;
}

/**
 * UN solo sistema de etiquetas en toda la app. Antes convivían "conectado",
 * "próximo", "en configuración", "soon" y puntitos de colores; ahora hay tres
 * estados y nada más.
 */
export const CONNECTION_STATES = ['conectado', 'sin_conectar', 'proximamente'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  conectado: 'Conectado',
  sin_conectar: 'Sin conectar',
  proximamente: 'Próximamente',
};
