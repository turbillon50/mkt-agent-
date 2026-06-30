import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

export type SocialToolkit = 'twitter' | 'linkedin';

export async function startConnection(
  userId: string,
  toolkit: SocialToolkit
): Promise<{ redirectUrl: string; connectionId: string }> {
  const connectionRequest = await composio.toolkits.authorize(userId, toolkit);
  return {
    redirectUrl: connectionRequest.redirectUrl ?? '',
    connectionId: connectionRequest.id ?? '',
  };
}

export async function isConnected(
  userId: string,
  toolkit: SocialToolkit
): Promise<boolean> {
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
