import { config, type Platform } from '../config.js';
import * as twitter from './twitter.js';
import * as linkedin from './linkedin.js';

export interface Poster {
  platform: Platform;
  post(text: string): Promise<{ id: string; url?: string }>;
  check(): Promise<{ ok: boolean; user?: string }>;
}

const all: Record<Platform, Poster> = { twitter, linkedin };

export function enabledPosters(): Poster[] {
  const list: Poster[] = [];
  if (config.twitter.enabled) list.push(twitter);
  if (config.linkedin.enabled) list.push(linkedin);
  return list;
}

export function getPoster(platform: Platform): Poster {
  const p = all[platform];
  if (!p) throw new Error(`Unknown platform: ${platform}`);
  return p;
}

export { twitter, linkedin };
