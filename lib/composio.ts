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
