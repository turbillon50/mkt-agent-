import axios from 'axios';
import { config } from '../config';

const API = 'https://api.linkedin.com/v2';

function headers() {
  if (!config.linkedin.accessToken) throw new Error('LINKEDIN_ACCESS_TOKEN is not set.');
  return {
    Authorization: `Bearer ${config.linkedin.accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

export async function post(text: string): Promise<{ id: string; url?: string }> {
  if (!config.linkedin.authorUrn) {
    throw new Error('LINKEDIN_AUTHOR_URN is not set (e.g. urn:li:person:XXXX).');
  }
  const body = {
    author: config.linkedin.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
  const { data, headers: resHeaders } = await axios.post(`${API}/ugcPosts`, body, { headers: headers() });
  const id: string = data?.id ?? resHeaders['x-restli-id'] ?? '';
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

export async function check(): Promise<{ ok: boolean; user?: string }> {
  const { data } = await axios.get(`${API}/userinfo`, { headers: headers() });
  return { ok: true, user: data?.name ?? data?.email ?? 'authenticated' };
}

export const platform = 'linkedin' as const;
