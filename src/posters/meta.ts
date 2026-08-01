import { config } from '../config';

interface MetaPageAccount {
  id: string;
  access_token: string;
}

async function freshPageToken(): Promise<string> {
  const { appId, appSecret, userToken, pageId } = config.meta;
  if (!appId || !appSecret || !userToken || !pageId) {
    throw new Error('Meta credentials are incomplete.');
  }
  // Con System User token, pedir access_token directo del objeto Page es el
  // metodo mas confiable (funciona con user token o system user por igual).
  const direct = await fetch(
    `https://graph.facebook.com/${pageId}?fields=access_token&access_token=${userToken}`
  );
  const directData = (await direct.json()) as { access_token?: string; error?: { message: string } };
  if (directData.access_token) return directData.access_token;

  const res = await fetch(
    `https://graph.facebook.com/me/accounts?access_token=${userToken}`
  );
  const data = (await res.json()) as { data?: MetaPageAccount[]; error?: { message: string } };
  if (data.error) throw new Error(`Meta /me/accounts: ${data.error.message}`);
  const page = data.data?.find((p) => p.id === pageId);
  if (!page) throw new Error(`Page ${pageId} not found in /me/accounts response.`);
  return page.access_token;
}

async function postFacebookText(text: string): Promise<{ id: string; url: string }> {
  const { pageId } = config.meta;
  const pageToken = await freshPageToken();
  const res = await fetch(`https://graph.facebook.com/v25.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: pageToken }),
  });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (data.error) throw new Error(`Meta post: ${data.error.message}`);
  return { id: data.id!, url: `https://www.facebook.com/${pageId}` };
}

async function postFacebookPhoto(
  text: string,
  imageUrl: string
): Promise<{ id: string; url: string }> {
  const { pageId } = config.meta;
  const pageToken = await freshPageToken();
  const res = await fetch(`https://graph.facebook.com/v25.0/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption: text, access_token: pageToken }),
  });
  const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string } };
  if (data.error) throw new Error(`Meta photo post: ${data.error.message}`);
  return { id: data.post_id || data.id!, url: `https://www.facebook.com/${pageId}` };
}

export async function post(
  text: string,
  imageUrl?: string
): Promise<{ id: string; url: string }> {
  return imageUrl ? postFacebookPhoto(text, imageUrl) : postFacebookText(text);
}

export async function postInstagram(
  imageUrl: string,
  caption: string
): Promise<{ id: string }> {
  const { igId } = config.meta;
  if (!igId) throw new Error('Meta Instagram Business Account ID missing.');
  const pageToken = await freshPageToken();

  const create = await fetch(`https://graph.facebook.com/v25.0/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: pageToken }),
  });
  const created = (await create.json()) as { id?: string; error?: { message: string } };
  if (created.error) throw new Error(`Meta IG container: ${created.error.message}`);

  const publish = await fetch(`https://graph.facebook.com/v25.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: pageToken }),
  });
  const published = (await publish.json()) as { id?: string; error?: { message: string } };
  if (published.error) throw new Error(`Meta IG publish: ${published.error.message}`);
  return { id: published.id! };
}

export async function check(): Promise<{ ok: boolean; user?: string }> {
  const pageToken = await freshPageToken();
  const res = await fetch(
    `https://graph.facebook.com/me?fields=name&access_token=${pageToken}`
  );
  const data = (await res.json()) as { name?: string; error?: { message: string } };
  if (data.error) return { ok: false };
  return { ok: true, user: data.name };
}

export const platform = 'meta' as const;

