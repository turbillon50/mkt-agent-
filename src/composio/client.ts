/**
 * Cliente de la API v3 de Composio.
 *
 * Es `fetch` a pelo y no el SDK a propósito: el SDK (@composio/core) esconde
 * campos que esta corrida necesita —el `callback_url` del Connect Link, el
 * `status_reason` de una cuenta caída, el logo del toolkit— y cuando no los
 * expone hay que salirse igual. Una sola forma de hablar con Composio se lee
 * mejor que dos.
 *
 * Vive en `src/` (no en `lib/`) porque lo usan las pruebas y los scripts de
 * tsx fuera de Next.
 *
 * UNA sola llave para todo Goossip: `COMPOSIO_API_KEY`. Las cuentas se separan
 * por `user_id`, y el `user_id` de Composio es el PROYECTO de Goossip — ver
 * `composioUserId()` en src/projects/connections.ts.
 */

const BASE = 'https://backend.composio.dev/api/v3';

/**
 * La llave, o null si no hay una de verdad.
 *
 * Vercel devuelve `[SENSITIVE]` cuando la variable está marcada como sensible,
 * y un entorno local puede traer el marcador de plantilla. Tratar esos valores
 * como llave hace que la pantalla ofrezca conectar y el usuario se estrelle con
 * un 401 crudo: mejor saber aquí que no hay llave.
 */
export function composioKey(): string | null {
  const raw = (process.env.COMPOSIO_API_KEY ?? '').trim();
  if (!raw || raw.startsWith('[') || raw.startsWith('<')) return null;
  return raw;
}

export function composioReady(): boolean {
  return composioKey() !== null;
}

export class ComposioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ComposioError';
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const key = composioKey();
  if (!key) throw new ComposioError('Falta la llave de Composio en este entorno.', 503);

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'x-api-key': key,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || json?.error) {
    const msg = json?.error?.message ?? json?.message ?? text.slice(0, 200) ?? 'Composio falló.';
    throw new ComposioError(msg, json?.error?.status ?? res.status, json?.error?.slug);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Toolkits
// ---------------------------------------------------------------------------

export interface Toolkit {
  slug: string;
  name: string;
  composio_managed_auth_schemes?: string[];
  auth_schemes?: string[];
  meta?: { logo?: string; description?: string; tools_count?: number };
}

export async function getToolkit(slug: string): Promise<Toolkit | null> {
  try {
    return await call<Toolkit>(`/toolkits/${slug}`);
  } catch (e) {
    if (e instanceof ComposioError && e.status === 404) return null;
    throw e;
  }
}

/** ¿Composio pone la app por nosotros para este toolkit? */
export function toolkitIsManaged(toolkit: Toolkit): boolean {
  return (toolkit.composio_managed_auth_schemes ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Auth configs — la "app" que Composio administra por toolkit
// ---------------------------------------------------------------------------

export interface AuthConfigSummary {
  id: string;
  toolkit?: { slug?: string };
  is_composio_managed?: boolean;
  status?: string;
  name?: string;
}

export async function listAuthConfigs(): Promise<AuthConfigSummary[]> {
  const out: AuthConfigSummary[] = [];
  let cursor: string | undefined;
  // Paginado: con 40+ auth configs en la cuenta, quedarse con la primera página
  // haría que el bootstrap creara duplicados de los que ya existen.
  for (let i = 0; i < 20; i += 1) {
    const page = await call<{ items: AuthConfigSummary[]; next_cursor?: string | null }>(
      '/auth_configs',
      { query: { limit: '100', cursor } },
    );
    out.push(...(page.items ?? []));
    cursor = page.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return out;
}

export async function createManagedAuthConfig(
  toolkitSlug: string,
  name: string,
): Promise<string> {
  const res = await call<{ auth_config: { id: string } }>('/auth_configs', {
    method: 'POST',
    body: {
      toolkit: { slug: toolkitSlug },
      auth_config: { type: 'use_composio_managed_auth', name },
    },
  });
  const id = res?.auth_config?.id;
  if (!id) throw new ComposioError(`Composio no devolvió el auth config de ${toolkitSlug}.`, 502);
  return id;
}

// ---------------------------------------------------------------------------
// Cuentas conectadas
// ---------------------------------------------------------------------------

/** Los estados que devuelve Composio. `ACTIVE` es el único que pinta verde. */
export type ConnectedAccountStatus =
  | 'ACTIVE'
  | 'INITIALIZING'
  | 'INITIATED'
  | 'EXPIRED'
  | 'FAILED'
  | 'INACTIVE'
  | 'DISABLED';

export interface ConnectedAccount {
  id: string;
  user_id: string;
  status: ConnectedAccountStatus | string;
  status_reason?: string | null;
  toolkit?: { slug?: string };
  auth_config?: { id?: string };
  created_at?: string;
  updated_at?: string;
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface ConnectLink {
  link_token: string;
  redirect_url: string;
  connected_account_id: string;
  expires_at?: string;
}

/**
 * Abre el Connect Link: la pantalla de permisos que Composio le pone al
 * usuario. `callback_url` es a dónde regresa el navegador cuando termina.
 *
 * Es `/connected_accounts/link` y no `/connected_accounts` porque Composio dejó
 * de aceptar el segundo para auth administrada (medido 16-sep-2026: contesta
 * 400 `ConnectedAccount_BadRequest` diciendo justo eso).
 */
export async function createConnectLink(input: {
  authConfigId: string;
  userId: string;
  callbackUrl: string;
}): Promise<ConnectLink> {
  return call<ConnectLink>('/connected_accounts/link', {
    method: 'POST',
    body: {
      auth_config_id: input.authConfigId,
      user_id: input.userId,
      callback_url: input.callbackUrl,
    },
  });
}

export async function getConnectedAccount(id: string): Promise<ConnectedAccount | null> {
  try {
    return await call<ConnectedAccount>(`/connected_accounts/${id}`);
  } catch (e) {
    if (e instanceof ComposioError && e.status === 404) return null;
    throw e;
  }
}

export async function listConnectedAccounts(input: {
  userId: string;
  toolkitSlug?: string;
}): Promise<ConnectedAccount[]> {
  const page = await call<{ items: ConnectedAccount[] }>('/connected_accounts', {
    query: {
      user_ids: input.userId,
      toolkit_slugs: input.toolkitSlug,
      limit: '100',
    },
  });
  return page.items ?? [];
}

export async function deleteConnectedAccount(id: string): Promise<boolean> {
  try {
    await call(`/connected_accounts/${id}`, { method: 'DELETE' });
    return true;
  } catch (e) {
    // Si ya no existe allá, el trabajo está hecho: lo que importa es que el
    // cliente deje de tener una cuenta viva colgada del proyecto.
    if (e instanceof ComposioError && e.status === 404) return true;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Ejecutar acciones
// ---------------------------------------------------------------------------

export interface ToolResult<T = any> {
  successful?: boolean;
  data?: T;
  error?: string | null;
  log_id?: string;
}

/**
 * Ejecuta una acción con la cuenta del PROYECTO.
 *
 * `userId` siempre es el del proyecto: quien aprieta el botón no presta su
 * cuenta, el proyecto usa la suya.
 */
export async function executeTool<T = any>(
  slug: string,
  input: {
    userId: string;
    arguments?: Record<string, unknown>;
    connectedAccountId?: string;
    version?: string;
  },
): Promise<ToolResult<T>> {
  const res = await call<ToolResult<T>>(`/tools/execute/${slug}`, {
    method: 'POST',
    body: {
      user_id: input.userId,
      arguments: input.arguments ?? {},
      ...(input.connectedAccountId ? { connected_account_id: input.connectedAccountId } : {}),
      ...(input.version ? { version: input.version } : {}),
    },
  });
  if (res?.successful === false) {
    throw new ComposioError(
      typeof res.error === 'string' && res.error ? res.error : `${slug} no se pudo ejecutar.`,
      502,
    );
  }
  return res;
}

/**
 * Variante exclusiva para tools que reciben archivo. El SDK convierte una URL
 * pública en el descriptor temporal que exige Composio; el cliente REST de
 * arriba no puede hacerlo. Las rutas locales están deshabilitadas.
 */
export async function executeToolWithFiles<T = any>(
  slug: string,
  input: {
    userId: string;
    arguments?: Record<string, unknown>;
    connectedAccountId?: string;
    version?: string;
  },
): Promise<ToolResult<T>> {
  const key = composioKey();
  if (!key) throw new ComposioError('Falta la llave de Composio en este entorno.', 503);

  const { Composio } = await import('@composio/core');
  const sdk = new Composio({
    apiKey: key,
    allowTracking: false,
    dangerouslyAllowAutoUploadDownloadFiles: true,
    sensitiveFileUploadProtection: true,
    // X recibe URLs públicas. No se permite leer ningún archivo del servidor.
    fileUploadDirs: false,
  });
  const res = await sdk.tools.execute(slug, {
    userId: input.userId,
    connectedAccountId: input.connectedAccountId,
    arguments: input.arguments ?? {},
    ...(input.version ? { version: input.version } : { dangerouslySkipVersionCheck: true }),
  });
  if (!res.successful) {
    throw new ComposioError(res.error || `${slug} no se pudo ejecutar.`, 502);
  }
  return {
    successful: res.successful,
    data: res.data as T,
    error: res.error,
    log_id: res.logId,
  };
}

/**
 * Llamada cruda a la API del proveedor, con Composio poniendo las credenciales.
 *
 * Se usa donde el toolkit no trae una tool para lo que Goossip necesita — el
 * caso real es Facebook: tiene 41 tools y ninguna lee formularios de lead ads,
 * que es de donde salen los leads del cliente. Sale por la misma conexión del
 * proyecto, así que el token nunca toca a Goossip.
 */
export interface ProxyResponse {
  data: any;
  /** Los encabezados que devolvió el PROVEEDOR, en minúsculas. */
  headers: Record<string, string>;
  status: number | null;
}

/** La llamada cruda, con todo lo que contestó el proveedor. */
export async function proxyExecuteFull(input: {
  connectedAccountId: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'DELETE';
  parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>;
  body?: unknown;
}): Promise<ProxyResponse> {
  const key = composioKey();
  if (!key) throw new ComposioError('Falta la llave de Composio en este entorno.', 503);
  const res = await fetch('https://backend.composio.dev/api/v3.1/tools/execute/proxy', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: input.endpoint,
      method: input.method,
      connected_account_id: input.connectedAccountId,
      parameters: input.parameters ?? [],
      ...(input.body ? { body: input.body } : {}),
    }),
    cache: 'no-store',
  });
  const json: any = await res.json().catch(() => null);

  /**
   * El proveedor puede contestar 4xx con HTTP 200 del lado de Composio: el
   * error viaja DENTRO, en `data.status` y `data.message`. Sin mirarlo, una
   * publicación rechazada por LinkedIn se leía como publicada.
   */
  const dentro = json?.data;
  const estadoProveedor: number | null =
    typeof json?.status === 'number' ? json.status : typeof dentro?.status === 'number' ? dentro.status : null;

  if (!res.ok || json?.error || (estadoProveedor !== null && estadoProveedor >= 400)) {
    /**
     * El motivo del PROVEEDOR, no un genérico.
     *
     * `dentro.error.message` va primero y no es un detalle: cuando Meta niega
     * la lectura de la página de un tercero contesta ahí dentro *"Object with
     * ID 'inmuebles24' does not exist, cannot be loaded due to missing
     * permissions"* — que dice exactamente qué falta y qué NO está roto.
     * Sin esta línea, la pantalla de Competencia decía "La llamada al proveedor
     * falló" y mandaba a nadie a diagnosticar nada.
     */
    const delProveedor =
      dentro?.error?.message ??
      dentro?.error?.error_user_msg ??
      json?.error?.message ??
      dentro?.message;
    throw new ComposioError(
      typeof delProveedor === 'string' && delProveedor.trim()
        ? delProveedor
        : 'La llamada al proveedor falló.',
      estadoProveedor ?? res.status,
    );
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(json?.headers ?? {})) {
    headers[k.toLowerCase()] = String(v);
  }

  return { data: dentro ?? json, headers, status: estadoProveedor };
}

export async function proxyExecute(input: {
  connectedAccountId: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'DELETE';
  parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>;
  body?: unknown;
}): Promise<any> {
  const r = await proxyExecuteFull(input);
  return r.data;
}
