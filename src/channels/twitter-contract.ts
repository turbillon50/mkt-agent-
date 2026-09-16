/**
 * Contrato medido contra el catálogo vivo de Composio el 16-sep-2026.
 *
 * Fijar la versión importa: sin ella Composio resuelve el contrato heredado,
 * donde `user_fields` cambia de nombre y la identidad de X falla aunque el
 * OAuth siga ACTIVE.
 */
export const TWITTER_TOOL_VERSION = '20260812_00';

export function twitterIdentityArguments() {
  return {
    user_fields: ['id', 'name', 'username', 'profile_image_url'],
  };
}

export function twitterPostArguments(text: string, mediaIds: string[] = []) {
  return {
    text,
    ...(mediaIds.length ? { media_media_ids: mediaIds } : {}),
  };
}
