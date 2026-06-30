import axios from 'axios';
import { config } from '../config';
import { postLinkedIn } from '../../lib/composio';

const API = 'https://api.linkedin.com/v2';

function headers() {
  if (!config.linkedin.accessToken) throw new Error('LINKEDIN_ACCESS_TOKEN is not set.');
  return {
    Authorization: `Bearer ${config.linkedin.accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

async function uploadImageFromUrl(imageUrl: string): Promise<string> {
  if (!config.linkedin.authorUrn) {
    throw new Error('LINKEDIN_AUTHOR_URN is not set.');
  }
  const register = await axios.post(
    `${API}/assets?action=registerUpload`,
    {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: config.linkedin.authorUrn,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    },
    { headers: headers() }
  );

  const uploadUrl: string =
    register.data.value.uploadMechanism[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ].uploadUrl;
  const asset: string = register.data.value.asset;

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`No pude descargar la imagen (${imageRes.status})`);
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  await axios.put(uploadUrl, buffer, {
    headers: {
      Authorization: `Bearer ${config.linkedin.accessToken}`,
      'Content-Type': imageRes.headers.get('content-type') || 'image/jpeg',
    },
  });

  return asset;
}

export async function post(text: string, imageUrl?: string): Promise<{ id: string; url?: string }> {
  if (!config.linkedin.authorUrn) {
    throw new Error('LINKEDIN_AUTHOR_URN is not set (e.g. urn:li:person:XXXX).');
  }

  const asset = imageUrl ? await uploadImageFromUrl(imageUrl) : null;

  const body = {
    author: config.linkedin.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: asset ? 'IMAGE' : 'NONE',
        ...(asset
          ? { media: [{ status: 'READY', media: asset }] }
          : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
  const { data, headers: resHeaders } = await axios.post(`${API}/ugcPosts`, body, { headers: headers() });
  const id: string = data?.id ?? resHeaders['x-restli-id'] ?? '';
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

export async function postForUser(
  userId: string,
  authorUrn: string,
  text: string
): Promise<{ id: string; url?: string }> {
  const result: any = await postLinkedIn(userId, authorUrn, text);
  const id = result?.data?.id ?? result?.id ?? '';
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

export async function check(): Promise<{ ok: boolean; user?: string }> {
  const { data } = await axios.get(`${API}/userinfo`, { headers: headers() });
  return { ok: true, user: data?.name ?? data?.email ?? 'authenticated' };
}

export const platform = 'linkedin' as const;
