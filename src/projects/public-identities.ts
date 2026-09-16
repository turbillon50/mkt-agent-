export interface PublicIdentity {
  id: string | null;
  handle: string | null;
  label: string | null;
  avatar?: string | null;
}

function value(...items: unknown[]): string | null {
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (typeof item === 'number') return String(item);
  }
  return null;
}

function deepValue(input: unknown, names: readonly string[], depth = 0): string | null {
  if (!input || typeof input !== 'object' || depth > 6) return null;
  const record = input as Record<string, unknown>;
  for (const name of names) {
    const found = value(record[name]);
    if (found) return found;
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') {
      const found = deepValue(child, names, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function handle(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

export function gmailPublicIdentity(raw: unknown): PublicIdentity {
  const email = deepValue(raw, ['emailAddress', 'email_address', 'email']);
  if (!email) throw new Error('Gmail no devolvió el correo autorizado.');
  return { id: email, handle: email, label: email };
}

export function tiktokPublicIdentity(raw: unknown): PublicIdentity {
  const username = deepValue(raw, ['username', 'unique_id', 'uniqueId']);
  const displayName = deepValue(raw, ['display_name', 'displayName', 'nickname', 'name']);
  const id = deepValue(raw, ['open_id', 'openId', 'union_id', 'unionId', 'id']);
  if (!username && !displayName && !id) {
    throw new Error('TikTok no devolvió la identidad autorizada.');
  }
  return {
    id,
    handle: handle(username),
    label: displayName ?? username ?? id,
    avatar: deepValue(raw, ['avatar_url', 'avatarUrl', 'avatar_large_url', 'avatarLargeUrl']),
  };
}

export function youtubePublicIdentity(raw: unknown): PublicIdentity {
  const items = (raw as { items?: unknown[] } | null)?.items;
  const channel = Array.isArray(items) ? items[0] : null;
  const id = deepValue(channel, ['id', 'channelId', 'channel_id']);
  const label = deepValue(channel, ['title', 'channelTitle', 'channel_title']);
  const customUrl = deepValue(channel, ['customUrl', 'custom_url']);
  if (!id || !label) throw new Error('YouTube no devolvió el canal autorizado.');
  return {
    id,
    handle: handle(customUrl),
    label,
    avatar: deepValue(channel, ['url']),
  };
}
