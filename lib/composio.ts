import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

export type SocialToolkit = 'twitter' | 'linkedin';

// Auth configs de Composio por toolkit. LinkedIn es Composio-managed (gratis,
// sin que el usuario registre su propia app). Twitter NO tiene credenciales
// administradas por Composio — requiere traer tu propia Twitter Developer App
// (client_id/client_secret OAuth2) y registrarla como auth_config tipo
// use_custom_auth. Hasta que eso exista, twitter queda deshabilitado.
const AUTH_CONFIG_IDS: Partial<Record<SocialToolkit, string>> = {
  linkedin: 'ac_X_E2b5Z1V3qb',
};

export function isToolkitConfigured(toolkit: SocialToolkit): boolean {
  return Boolean(AUTH_CONFIG_IDS[toolkit]);
}

export async function startConnection(
  userId: string,
  toolkit: SocialToolkit
): Promise<{ redirectUrl: string; connectionId: string }> {
  const authConfigId = AUTH_CONFIG_IDS[toolkit];
  if (!authConfigId) {
    throw new Error(
      `${toolkit} no tiene una app de developer configurada todavia. Necesitas registrar credenciales propias antes de poder conectarlo.`
    );
  }
  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId);
  return {
    redirectUrl: connectionRequest.redirectUrl ?? '',
    connectionId: connectionRequest.id ?? '',
  };
}

export async function isConnected(
  userId: string,
  toolkit: SocialToolkit
): Promise<boolean> {
  if (!isToolkitConfigured(toolkit)) return false;
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkit],
  });
  return accounts.items.some((acc) => acc.status === 'ACTIVE');
}

export async function postTweet(userId: string, text: string) {
  return composio.tools.execute('TWITTER_CREATION_OF_A_POST', {
    userId,
    arguments: { text },
  });
}

/**
 * Saca el URN propio del usuario conectado (urn:li:person:XXXX). Necesario
 * porque LINKEDIN_CREATE_LINKED_IN_POST exige "author" explicito — no asume
 * "publica como quien esta conectado". Sin esto, publicar multi-tenant
 * publicaría siempre en la cuenta de quien sea que tenga el URN hardcodeado.
 */
export async function getMyLinkedInUrn(userId: string): Promise<string> {
  const res: any = await composio.tools.execute('LINKEDIN_GET_MY_INFO', {
    userId,
    arguments: {},
  });
  const data = res?.data ?? res;
  const rawId: string | undefined =
    data?.id ?? data?.sub ?? data?.author ?? data?.personUrn ?? data?.urn;
  if (!rawId) {
    throw new Error('No se pudo obtener tu identidad de LinkedIn. Reconecta tu cuenta en Integraciones.');
  }
  return rawId.startsWith('urn:li:person:') ? rawId : `urn:li:person:${rawId}`;
}

export async function postLinkedIn(
  userId: string,
  authorUrn: string,
  commentary: string
) {
  return composio.tools.execute('LINKEDIN_CREATE_LINKED_IN_POST', {
    userId,
    arguments: {
      author: authorUrn,
      commentary,
      visibility: 'PUBLIC',
    },
  });
}

/**
 * Publica en LinkedIn usando la cuenta CONECTADA del usuario (multi-tenant
 * real). Saca el URN propio en el momento, no lo asume ni lo cachea —
 * publicar en la cuenta equivocada es el peor error posible aqui.
 */
export async function postLinkedInForUser(
  userId: string,
  commentary: string
): Promise<{ id?: string; url?: string }> {
  const urn = await getMyLinkedInUrn(userId);
  const res: any = await postLinkedIn(userId, urn, commentary);
  const data = res?.data ?? res;
  const postId: string | undefined = data?.id ?? data?.postId ?? data?.shareId;
  return { id: postId, url: postId ? `https://www.linkedin.com/feed/update/${postId}/` : undefined };
}

// ============================================================
// Google Ads — auth config propio (custom OAuth, developer token
// propio nivel Explorer Access). El toolkit "googleads" de Composio
// trae muy pocas tools predefinidas (no permite crear/editar campañas),
// asi que para operaciones reales usamos proxy execute contra la API
// REST v23 de Google Ads directamente, dejando que Composio adjunte
// las credenciales (sin exponer el token crudo a la app). La conexión
// inicial se hace con fetch directo a la REST API de Composio porque el
// SDK (@composio/core) no expone bien el campo extra "customer_id" que
// requiere este auth config particular.
// ============================================================

const GOOGLE_ADS_AUTH_CONFIG_ID = 'ac_Z0uC87Lgpj-3';
const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v23';
const GOOGLE_ADS_DEVELOPER_TOKEN = 'Lzit41AqBs2luUzU8iFq8g';
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = '7745650752'; // MCC

export async function startGoogleAdsConnection(
  userId: string,
  customerId: string
): Promise<{ redirectUrl: string; connectionId: string }> {
  const normalized = customerId.replace(/[^0-9]/g, '');
  if (normalized.length !== 10) {
    throw new Error('El ID de cliente de Google Ads debe tener 10 dígitos (formato 123-456-7890).');
  }
  const res = await fetch('https://backend.composio.dev/api/v3/connected_accounts', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.COMPOSIO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_config: { id: GOOGLE_ADS_AUTH_CONFIG_ID },
      connection: { user_id: userId, data: { customer_id: normalized } },
    }),
  });
  const json: any = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? 'No se pudo iniciar la conexión con Google Ads.');
  }
  return {
    redirectUrl: json.redirect_url ?? '',
    connectionId: json.id ?? '',
  };
}

export async function getGoogleAdsConnection(
  userId: string
): Promise<{ connectionId: string; customerId: string | null } | null> {
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: ['googleads'],
  });
  const active = accounts.items.find((acc) => acc.status === 'ACTIVE');
  if (!active) return null;
  const data: any = (active as any).data ?? {};
  return { connectionId: active.id, customerId: data.customer_id ?? null };
}

export async function isGoogleAdsConnected(userId: string): Promise<boolean> {
  return (await getGoogleAdsConnection(userId)) !== null;
}

async function googleAdsProxy(
  connectedAccountId: string,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: unknown,
  loginCustomerId?: string
): Promise<any> {
  const headerParams: Array<{ name: string; value: string; type: 'header' }> = [
    { name: 'developer-token', value: GOOGLE_ADS_DEVELOPER_TOKEN, type: 'header' },
  ];
  if (loginCustomerId) {
    headerParams.push({ name: 'login-customer-id', value: loginCustomerId, type: 'header' });
  }
  const res = await fetch('https://backend.composio.dev/api/v3.1/tools/execute/proxy', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.COMPOSIO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint: `${GOOGLE_ADS_API_BASE}/${endpoint}`,
      method,
      connected_account_id: connectedAccountId,
      parameters: headerParams,
      ...(body ? { body } : {}),
    }),
  });
  const json: any = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message ?? json?.data?.message ?? 'Google Ads API request failed.');
  }
  return json.data;
}

export async function listAccessibleCustomers(connectedAccountId: string): Promise<string[]> {
  const data = await googleAdsProxy(connectedAccountId, 'customers:listAccessibleCustomers', 'GET');
  return (data?.resourceNames ?? []).map((r: string) => r.replace('customers/', ''));
}

export type GoogleAdsCampaign = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  budgetMicros: string | null;
};

export async function listCampaigns(
  connectedAccountId: string,
  customerId: string
): Promise<GoogleAdsCampaign[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros
    FROM campaign
    ORDER BY campaign.id
  `;
  const data = await googleAdsProxy(
    connectedAccountId,
    `customers/${customerId}/googleAds:search`,
    'POST',
    { query },
    GOOGLE_ADS_LOGIN_CUSTOMER_ID
  );
  const results = data?.results ?? [];
  return results.map((r: any) => ({
    id: r.campaign?.id ?? '',
    name: r.campaign?.name ?? '(sin nombre)',
    status: r.campaign?.status ?? 'UNKNOWN',
    channelType: r.campaign?.advertisingChannelType ?? 'UNKNOWN',
    budgetMicros: r.campaignBudget?.amountMicros ?? null,
  }));
}

export async function setCampaignStatus(
  connectedAccountId: string,
  customerId: string,
  campaignId: string,
  status: 'ENABLED' | 'PAUSED'
): Promise<void> {
  await googleAdsProxy(
    connectedAccountId,
    `customers/${customerId}/campaigns:mutate`,
    'POST',
    {
      operations: [
        {
          update: {
            resourceName: `customers/${customerId}/campaigns/${campaignId}`,
            status,
          },
          updateMask: 'status',
        },
      ],
    },
    GOOGLE_ADS_LOGIN_CUSTOMER_ID
  );
}

// ============================================================
// Email — Gmail / Outlook via Composio. Mismo patrón self-service que
// X/LinkedIn: cada usuario conecta SU propia cuenta y Goossip lee/envía
// con su autorización explícita (multi-tenant, keyed por Clerk userId).
//
// Los auth_config de Gmail/Outlook se crean UNA vez en el dashboard de
// Composio y se referencian por env var (igual que LinkedIn/Google Ads
// traen su id). Se leen de env en vez de hardcodear ids inexistentes:
// mientras no estén, isEmailToolkitConfigured() = false y la UI muestra
// "en configuración" (mismo gate honesto que twitter). En cuanto se
// setean COMPOSIO_GMAIL_AUTH_CONFIG_ID / COMPOSIO_OUTLOOK_AUTH_CONFIG_ID,
// la conexión queda viva sin tocar código.
// ============================================================

export type EmailToolkit = 'gmail' | 'outlook';

const EMAIL_AUTH_CONFIG_IDS: Partial<Record<EmailToolkit, string | undefined>> = {
  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
  outlook: process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID,
};

// Slugs de tools de Composio por proveedor. Gmail son los slugs estables y
// verificados; Outlook va detrás del mismo gate de auth_config, así que sus
// slugs solo entran en juego cuando se habilita explícitamente.
const EMAIL_TOOL_SLUGS: Record<EmailToolkit, { send: string; fetch: string }> = {
  gmail: { send: 'GMAIL_SEND_EMAIL', fetch: 'GMAIL_FETCH_EMAILS' },
  outlook: { send: 'OUTLOOK_OUTLOOK_SEND_EMAIL', fetch: 'OUTLOOK_OUTLOOK_LIST_MESSAGES' },
};

export function isEmailToolkitConfigured(toolkit: EmailToolkit): boolean {
  return Boolean(EMAIL_AUTH_CONFIG_IDS[toolkit]);
}

export function configuredEmailToolkits(): EmailToolkit[] {
  return (Object.keys(EMAIL_TOOL_SLUGS) as EmailToolkit[]).filter(isEmailToolkitConfigured);
}

export async function startEmailConnection(
  userId: string,
  toolkit: EmailToolkit
): Promise<{ redirectUrl: string; connectionId: string }> {
  const authConfigId = EMAIL_AUTH_CONFIG_IDS[toolkit];
  if (!authConfigId) {
    throw new Error(
      `${toolkit === 'gmail' ? 'Gmail' : 'Outlook'} todavía no está configurado. Falta registrar el auth config de Composio.`
    );
  }
  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId);
  return {
    redirectUrl: connectionRequest.redirectUrl ?? '',
    connectionId: connectionRequest.id ?? '',
  };
}

export async function isEmailConnected(userId: string, toolkit: EmailToolkit): Promise<boolean> {
  if (!isEmailToolkitConfigured(toolkit)) return false;
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkit],
  });
  return accounts.items.some((acc) => acc.status === 'ACTIVE');
}

/** Devuelve el primer proveedor de correo que el usuario tenga conectado, o null. */
export async function getConnectedEmailToolkit(userId: string): Promise<EmailToolkit | null> {
  for (const tk of configuredEmailToolkits()) {
    if (await isEmailConnected(userId, tk).catch(() => false)) return tk;
  }
  return null;
}

export type EmailMessage = {
  id: string | null;
  from: string | null;
  subject: string | null;
  snippet: string | null;
  date: string | null;
};

/**
 * Normaliza la respuesta de fetch de Gmail/Outlook a una forma común. Cada
 * toolkit devuelve estructuras distintas, así que se buscan los campos por
 * varios nombres posibles sin asumir uno solo.
 */
function normalizeEmails(raw: any): EmailMessage[] {
  const data = raw?.data ?? raw ?? {};
  const list: any[] =
    data.messages ?? data.value ?? data.emails ?? data.items ?? (Array.isArray(data) ? data : []);
  return list.slice(0, 25).map((m: any) => ({
    id: m.id ?? m.messageId ?? m.message_id ?? null,
    from: m.from ?? m.sender ?? m.fromAddress ?? m.payload?.from ?? null,
    subject: m.subject ?? m.payload?.subject ?? null,
    snippet: m.snippet ?? m.preview ?? m.bodyPreview ?? m.body?.slice?.(0, 160) ?? null,
    date: m.date ?? m.receivedDateTime ?? m.internalDate ?? null,
  }));
}

/** Lee los correos recientes de la cuenta conectada del usuario. */
export async function fetchRecentEmails(
  userId: string,
  opts: { query?: string; maxResults?: number } = {}
): Promise<{ toolkit: EmailToolkit; messages: EmailMessage[] }> {
  const toolkit = await getConnectedEmailToolkit(userId);
  if (!toolkit) {
    throw new Error('No tienes ninguna cuenta de correo conectada. Conéctala en Integraciones.');
  }
  const res: any = await composio.tools.execute(EMAIL_TOOL_SLUGS[toolkit].fetch, {
    userId,
    arguments: {
      max_results: Math.min(Math.max(opts.maxResults ?? 10, 1), 25),
      ...(opts.query ? { query: opts.query } : {}),
    },
  });
  return { toolkit, messages: normalizeEmails(res) };
}

/** Envía un correo básico desde la cuenta conectada del usuario. */
export async function sendEmail(
  userId: string,
  input: { to: string; subject: string; body: string; isHtml?: boolean }
): Promise<{ toolkit: EmailToolkit; ok: boolean }> {
  const toolkit = await getConnectedEmailToolkit(userId);
  if (!toolkit) {
    throw new Error('No tienes ninguna cuenta de correo conectada. Conéctala en Integraciones.');
  }
  const args =
    toolkit === 'gmail'
      ? { recipient_email: input.to, subject: input.subject, body: input.body, is_html: Boolean(input.isHtml) }
      : { to_recipients: [input.to], subject: input.subject, body: input.body, is_html: Boolean(input.isHtml) };

  const res: any = await composio.tools.execute(EMAIL_TOOL_SLUGS[toolkit].send, {
    userId,
    arguments: args,
  });
  const ok = res?.successful ?? res?.success ?? !res?.error;
  if (!ok) {
    throw new Error(res?.error?.message ?? res?.error ?? 'No se pudo enviar el correo.');
  }
  return { toolkit, ok: true };
}
