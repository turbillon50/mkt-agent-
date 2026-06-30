import { TwitterApi, TwitterApiv2 } from 'twitter-api-v2';
import { config } from '../config';
import { postTweet } from '../../lib/composio';

let client: TwitterApi | null = null;

function v2(): TwitterApiv2 {
  const { appKey, appSecret, accessToken, accessSecret } = config.twitter;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter credentials are incomplete.');
  }
  if (!client) client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
  return client.v2;
}

export async function post(text: string): Promise<{ id: string; url: string }> {
  const res = await v2().tweet(text);
  return { id: res.data.id, url: `https://twitter.com/i/status/${res.data.id}` };
}

export async function postForUser(
  userId: string,
  text: string
): Promise<{ id: string; url: string }> {
  const result: any = await postTweet(userId, text);
  const id = result?.data?.id ?? result?.id ?? '';
  return { id, url: id ? `https://twitter.com/i/status/${id}` : '' };
}

export async function check(): Promise<{ ok: boolean; user?: string }> {
  const me = await v2().me();
  return { ok: true, user: me.data.username };
}

export const platform = 'twitter' as const;
