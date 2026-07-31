import { config, type Platform } from '../config';
import * as twitter from './twitter';
import * as linkedin from './linkedin';
import * as meta from './meta';
import { postInstagram } from './meta';

export interface Poster {
  platform: Platform;
  post(text: string, imageUrl?: string): Promise<{ id: string; url?: string }>;
  check(): Promise<{ ok: boolean; user?: string }>;
}

const instagram: Poster = {
  platform: 'instagram',
  async post(text: string, imageUrl?: string) {
    if (!imageUrl) throw new Error('Instagram requiere una imagen.');
    const out = await postInstagram(imageUrl, text);
    return { id: out.id, url: 'https://instagram.com' };
  },
  async check() {
    return meta.check();
  },
};

const all: Record<Platform, Poster> = { twitter, linkedin, meta, instagram };

export function enabledPosters(): Poster[] {
  const list: Poster[] = [];
  if (config.twitter.enabled) list.push(twitter);
  if (config.linkedin.enabled) list.push(linkedin);
  if (config.meta.enabled) list.push(meta);
  return list;
}

export function getPoster(platform: Platform): Poster {
  const p = all[platform];
  if (!p) throw new Error(`Unknown platform: ${platform}`);
  return p;
}

export { twitter, linkedin, meta };
