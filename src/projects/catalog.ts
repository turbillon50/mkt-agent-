/**
 * El CATÁLOGO de conexiones del proyecto.
 *
 * Corrida 5: todo lo que se conecta pasa por Composio, con la app administrada
 * por Composio. Goossip no registra una app propia en Meta, Google, LinkedIn ni
 * nadie: un usuario que nace hoy entra, aprieta "Conectar" y autoriza en la
 * pantalla del proveedor. Por eso `via: 'composio'` es la regla y `'goossip'`
 * la excepción (lo que no es de un tercero: el formulario del sitio y el
 * catálogo del cliente).
 *
 * `managed` NO se decide de memoria. Se midió el 16-sep-2026 contra
 * `GET /api/v3/toolkits/{slug}` mirando `composio_managed_auth_schemes`:
 *
 *   con auth administrada (17) — facebook, instagram, googleads, linkedin,
 *     youtube, mailchimp, canva, googlesheets, airtable, notion, googledrive,
 *     hubspot, google_analytics, google_search_console, googlecalendar, gmail,
 *     slack.
 *   SIN auth administrada (5) — metaads, tiktok, twitter, klaviyo, semrush.
 *     Piden credenciales de una app propia (client_id/client_secret) o una
 *     API key del cliente. Salen "Próximamente" y no se inventan.
 *
 * Klaviyo no tiene auth administrada, así que el catálogo lleva MAILCHIMP en su
 * lugar, que sí la tiene — es la salida que el propio issue autoriza.
 */

export type ConnectorGroup = 'publicidad' | 'conocimiento' | 'operacion';

export const CONNECTOR_GROUPS: readonly ConnectorGroup[] = [
  'publicidad',
  'conocimiento',
  'operacion',
];

export const CONNECTOR_GROUP_LABEL: Record<ConnectorGroup, string> = {
  publicidad: 'Publicidad y publicación',
  conocimiento: 'Fuentes de conocimiento y verdad',
  operacion: 'Operación',
};

export const CONNECTOR_GROUP_BLURB: Record<ConnectorGroup, string> = {
  publicidad: 'Donde sale tu marca y de donde entra la gente.',
  conocimiento: 'De donde tu vendedor saca la verdad: precios, unidades, números.',
  operacion: 'El día a día: agenda, correo y avisos al equipo.',
};

export interface Connector {
  /** Slug del toolkit en Composio, o el id del canal propio de Goossip. */
  slug: string;
  via: 'composio' | 'goossip';
  group: ConnectorGroup;
  /** Lo que lee el usuario. */
  label: string;
  /** Una línea de qué habilita en Goossip. Sin jerga, escrita por nosotros. */
  blurb: string;
  /**
   * Tiene auth administrada por Composio (medido, ver cabecera). Si es false,
   * la tarjeta sale "Próximamente": conectarlo pediría una app de developer
   * propia, que es justo lo que esta corrida quita de en medio.
   */
  managed: boolean;
  /** Aviso corto en la tarjeta. Solo cuando de verdad cambia lo que el usuario debe hacer. */
  note?: string;
}

export const CONNECTORS = [
  // --- Publicidad y publicación -------------------------------------------
  {
    slug: 'metaads',
    via: 'composio',
    group: 'publicidad',
    label: 'Meta Ads',
    blurb: 'Lee tus campañas, lo que llevas gastado y de dónde vienen los leads.',
    managed: false,
  },
  {
    slug: 'facebook',
    via: 'composio',
    group: 'publicidad',
    label: 'Facebook',
    blurb: 'Publica en tu página y recibe a la gente de tus formularios de anuncios.',
    managed: true,
  },
  {
    slug: 'instagram',
    via: 'composio',
    group: 'publicidad',
    label: 'Instagram',
    blurb: 'Publica tus fotos y contesta los mensajes directos.',
    managed: true,
    note: 'Requiere cuenta Business o Creator ligada a una página de Facebook.',
  },
  {
    slug: 'googleads',
    via: 'composio',
    group: 'publicidad',
    label: 'Google Ads',
    blurb: 'Mira tus campañas de búsqueda y cuánto te está costando cada cliente.',
    managed: true,
  },
  {
    slug: 'linkedin',
    via: 'composio',
    group: 'publicidad',
    label: 'LinkedIn',
    blurb: 'Publica a tu nombre o al de la empresa.',
    managed: true,
  },
  {
    slug: 'tiktok',
    via: 'composio',
    group: 'publicidad',
    label: 'TikTok',
    blurb: 'Sube tus videos y mira cómo les fue.',
    managed: false,
  },
  {
    slug: 'twitter',
    via: 'composio',
    group: 'publicidad',
    label: 'X',
    blurb: 'Publica en la cuenta de tu marca.',
    managed: false,
  },
  {
    slug: 'youtube',
    via: 'composio',
    group: 'publicidad',
    label: 'YouTube',
    blurb: 'Sube videos a tu canal y mira sus números.',
    managed: true,
  },
  {
    slug: 'mailchimp',
    via: 'composio',
    group: 'publicidad',
    label: 'Mailchimp',
    blurb: 'Manda campañas de correo a tus listas y ve quién abrió.',
    managed: true,
  },
  {
    slug: 'canva',
    via: 'composio',
    group: 'publicidad',
    label: 'Canva',
    blurb: 'Usa tus diseños y plantillas de marca en las publicaciones.',
    managed: true,
  },

  // --- Fuentes de conocimiento y verdad ------------------------------------
  {
    slug: 'googlesheets',
    via: 'composio',
    group: 'conocimiento',
    label: 'Google Sheets',
    blurb: 'Tus hojas de precios e inventario, para que el vendedor cotice de verdad.',
    managed: true,
  },
  {
    slug: 'airtable',
    via: 'composio',
    group: 'conocimiento',
    label: 'Airtable',
    blurb: 'Tus bases de unidades, clientes o proyectos.',
    managed: true,
  },
  {
    slug: 'notion',
    via: 'composio',
    group: 'conocimiento',
    label: 'Notion',
    blurb: 'Tus documentos y manuales entran a la base de conocimiento.',
    managed: true,
  },
  {
    slug: 'googledrive',
    via: 'composio',
    group: 'conocimiento',
    label: 'Google Drive',
    blurb: 'Tus carpetas de brochures, fichas técnicas y listas de precios.',
    managed: true,
  },
  {
    slug: 'hubspot',
    via: 'composio',
    group: 'conocimiento',
    label: 'HubSpot',
    blurb: 'Tus contactos, en los dos sentidos: los lee y le manda los nuevos.',
    managed: true,
  },
  {
    slug: 'google_analytics',
    via: 'composio',
    group: 'conocimiento',
    label: 'Google Analytics',
    blurb: 'Qué hace la gente en tu sitio después de ver el anuncio.',
    managed: true,
  },
  {
    slug: 'google_search_console',
    via: 'composio',
    group: 'conocimiento',
    label: 'Search Console',
    blurb: 'Con qué te busca la gente en Google y en qué lugar apareces.',
    managed: true,
  },
  {
    slug: 'semrush',
    via: 'composio',
    group: 'conocimiento',
    label: 'Semrush',
    blurb: 'Palabras clave y qué anuncia tu competencia.',
    managed: false,
  },
  {
    // Corrida 7. `managed` medido el 16-sep-2026 contra
    // `GET /api/v3/toolkits/google_maps`: `composio_managed_auth_schemes` trae
    // `["OAUTH2"]` y el toolkit publica `GOOGLE_MAPS_TEXT_SEARCH` y
    // `GOOGLE_MAPS_NEARBY_SEARCH`, que es exactamente lo que pide Prospección.
    //
    // Conectarlo NO es obligatorio para usar la herramienta: sin él, la
    // búsqueda sale por la llave oficial de la casa. Lo que cambia es de quién
    // es la cuenta a la que Google le cobra — y siendo el negocio del cliente,
    // lo natural es que sea la suya.
    slug: 'google_maps',
    via: 'composio',
    group: 'conocimiento',
    label: 'Google Maps',
    blurb: 'Busca negocios por zona y giro para prospectar, con tu propia cuenta de Google.',
    managed: true,
    note: 'Si no lo conectas, la búsqueda sale por la cuenta de Goossip y cuenta contra tu tope mensual.',
  },
  {
    slug: 'sitio',
    via: 'goossip',
    group: 'conocimiento',
    label: 'Tu sitio web',
    blurb: 'Los formularios de tu página entran directo al pipeline.',
    managed: true,
  },
  {
    slug: 'mcp',
    via: 'goossip',
    group: 'conocimiento',
    label: 'Tu catálogo',
    blurb: 'Para que el vendedor cotice con precios y unidades reales.',
    managed: true,
  },

  // --- Operación ------------------------------------------------------------
  {
    slug: 'googlecalendar',
    via: 'composio',
    group: 'operacion',
    label: 'Google Calendar',
    blurb: 'Agenda las citas del vendedor en tu calendario de siempre.',
    managed: true,
  },
  {
    slug: 'gmail',
    via: 'composio',
    group: 'operacion',
    label: 'Gmail',
    blurb: 'Escribe a los leads desde tu propio correo.',
    managed: true,
  },
  {
    slug: 'slack',
    via: 'composio',
    group: 'operacion',
    label: 'Slack',
    blurb: 'Avisa a tu equipo cuando entra un lead o algo necesita mano humana.',
    managed: true,
  },
  {
    slug: 'whatsapp',
    via: 'goossip',
    group: 'operacion',
    label: 'WhatsApp',
    blurb: 'El número por el que tu vendedor contesta.',
    managed: true,
  },
] as const satisfies readonly Connector[];

/**
 * Los slugs válidos, como tipo. Sale del propio catálogo para que agregar un
 * conector no pida tocar tres listas — y para que `connection_links.channel`
 * no pueda guardar un canal que no existe.
 */
export type ConnectorSlug = (typeof CONNECTORS)[number]['slug'] | 'meta';

/**
 * El canal viejo de Meta con app propia. Vive detrás de `META_OWN_APP` y por
 * omisión está APAGADO (corrida 5): con Composio ya no hace falta y tener dos
 * caminos al mismo Facebook es como se conectan dos páginas distintas al mismo
 * proyecto. El código de la corrida 3 no se borra — se apaga.
 */
export const META_OWN_APP_CONNECTOR: Connector = {
  slug: 'meta',
  via: 'goossip',
  group: 'publicidad',
  label: 'Facebook e Instagram (app propia)',
  blurb: 'Tus páginas y los formularios de anuncios.',
  managed: true,
};

export function metaOwnAppEnabled(): boolean {
  return (process.env.META_OWN_APP ?? '').trim().toLowerCase() === 'true';
}

/** El catálogo que aplica hoy, con la bandera de Meta ya resuelta. */
export function activeConnectors(): Connector[] {
  const base: Connector[] = [...CONNECTORS];
  if (metaOwnAppEnabled()) base.unshift(META_OWN_APP_CONNECTOR);
  return base;
}

export function connectorBySlug(slug: string): Connector | null {
  if (slug === META_OWN_APP_CONNECTOR.slug) return META_OWN_APP_CONNECTOR;
  return CONNECTORS.find((c) => c.slug === slug) ?? null;
}

export function connectorOrThrow(slug: string): Connector {
  const c = connectorBySlug(slug);
  if (!c) throw new Error(`Conexión desconocida: ${slug}`);
  return c;
}

/**
 * Cómo se engancha:
 *   oauth      — el usuario autoriza en la pantalla del proveedor (todo Composio)
 *   datos      — el usuario escribe un id público (WhatsApp, catálogo)
 *   automatico — Goossip la genera sola (el formulario del sitio)
 */
export type ConnectionMode = 'oauth' | 'datos' | 'automatico';

export function connectorMode(slug: string): ConnectionMode {
  const c = connectorOrThrow(slug);
  if (c.via === 'composio' || c.slug === 'meta') return 'oauth';
  return c.slug === 'sitio' ? 'automatico' : 'datos';
}

/**
 * Se puede pedir por enlace de un solo uso a alguien de fuera ("pídele a tu
 * community manager que conecte el Facebook"). Todo lo que se autoriza en la
 * pantalla del proveedor sirve; lo que se escribe a mano, no: mandar a un
 * tercero a teclear el id de tu WhatsApp no le ahorra el trabajo a nadie.
 */
export function connectorShareable(slug: string): boolean {
  return connectorMode(slug) === 'oauth';
}

/** Los toolkits de Composio que el bootstrap tiene que dejar listos. */
export function managedComposioSlugs(): string[] {
  return CONNECTORS.filter((c) => c.via === 'composio' && c.managed).map((c) => c.slug);
}

/** Los que se quedan fuera por no tener auth administrada, con su nombre. */
export function unmanagedComposioConnectors(): Connector[] {
  return CONNECTORS.filter((c) => c.via === 'composio' && !c.managed);
}

export function isCatalogSlug(value: unknown): value is ConnectorSlug {
  return typeof value === 'string' && connectorBySlug(value) !== null;
}

/**
 * El logo del toolkit. Composio lo publica en `toolkit.meta.logo` y la URL es
 * siempre la misma forma; el bootstrap guarda la que devolvió la API y esto es
 * el respaldo para cuando la fila todavía no existe.
 */
export function defaultLogo(slug: string): string {
  return `https://logos.composio.dev/api/${slug}`;
}
