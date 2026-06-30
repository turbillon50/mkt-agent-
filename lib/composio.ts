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
