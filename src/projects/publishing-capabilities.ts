import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { socialAccounts, type Project, type SocialAccount } from '../db/schema';
import { cuerpo, run } from '../channels/base';
import { paginasDeFacebook } from '../channels/facebook';

export interface PublicIdentity {
  id: string | null;
  handle: string | null;
  label: string | null;
  avatar?: string | null;
}

export interface PublishingCapability {
  ready: boolean;
  text: boolean;
  image: boolean;
  video: boolean;
  checkedAt: string;
  reason: string | null;
}

const PUBLICATION_CHANNELS = ['facebook', 'instagram', 'linkedin', 'twitter'] as const;

function value(...items: unknown[]): string | null {
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (typeof item === 'number') return String(item);
  }
  return null;
}

function safeReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'No respondió el proveedor.');
  return raw
    .replace(/\b(access[_-]?token|refresh[_-]?token|api[_-]?key|authorization)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[OCULTO]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 240);
}

async function identityFor(project: Project, account: SocialAccount): Promise<{
  identity: PublicIdentity;
  capability: PublishingCapability;
}> {
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, reason: null };

  if (account.platform === 'facebook') {
    const pages = await paginasDeFacebook(project);
    const meta = (account.metadata ?? {}) as { page_id?: string };
    const page = pages.find((p) => p.id === String(meta.page_id ?? account.externalId ?? '')) ?? pages[0];
    if (!page) throw new Error('La cuenta no administra ninguna página de Facebook.');
    const canCreate = page.tareas.length === 0 || page.tareas.includes('CREATE_CONTENT');
    const ready = canCreate && page.conToken;
    return {
      identity: { id: page.id, handle: null, label: page.nombre },
      capability: {
        ...base,
        ready,
        text: ready,
        image: ready,
        video: ready,
        reason: !canCreate
          ? 'La cuenta no tiene permiso CREATE_CONTENT en esta página.'
          : !page.conToken
            ? 'Facebook no entregó el permiso de página necesario para publicar.'
            : null,
      },
    };
  }

  if (account.platform === 'instagram') {
    const raw: any = cuerpo(await run(project, 'instagram', 'INSTAGRAM_GET_USER_INFO', {}));
    const data = raw?.data ?? raw?.user ?? raw;
    const id = value(data?.id, data?.ig_user_id);
    const username = value(data?.username);
    if (!id || !username) throw new Error('Instagram no devolvió la cuenta profesional autorizada.');
    return {
      identity: {
        id,
        handle: username.startsWith('@') ? username : `@${username}`,
        label: value(data?.name, username),
        avatar: value(data?.profile_picture_url),
      },
      capability: { ...base, ready: true, text: false, image: true, video: true },
    };
  }

  if (account.platform === 'twitter') {
    const raw: any = cuerpo(
      await run(project, 'twitter', 'TWITTER_USER_LOOKUP_ME', {
        user_fields: 'id,name,username,profile_image_url',
      }),
    );
    const data = raw?.data ?? raw?.user ?? raw;
    const id = value(data?.id);
    const username = value(data?.username);
    if (!id || !username) throw new Error('X no devolvió el @usuario de la cuenta autorizada.');
    return {
      identity: {
        id,
        handle: username.startsWith('@') ? username : `@${username}`,
        label: value(data?.name, username),
        avatar: value(data?.profile_image_url),
      },
      capability: { ...base, ready: true, text: true, image: true, video: true },
    };
  }

  const raw: any = cuerpo(await run(project, 'linkedin', 'LINKEDIN_GET_MY_INFO', {}));
  const data = raw?.data ?? raw;
  const id = value(data?.author_id, data?.id, data?.sub, data?.personUrn);
  if (!id) throw new Error('LinkedIn no devolvió la identidad autorizada.');
  const first = value(data?.localizedFirstName, data?.first_name) ?? '';
  const last = value(data?.localizedLastName, data?.last_name) ?? '';
  return {
    identity: { id, handle: null, label: value(data?.name, `${first} ${last}`.trim(), id) },
    capability: { ...base, ready: true, text: true, image: true, video: false },
  };
}

/** Refresca identidad y preflight publicable sin copiar secretos a la respuesta. */
export async function refreshPublishingCapabilities(project: Project): Promise<void> {
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.status, 'connected'),
      ),
    );

  await Promise.all(
    accounts
      .filter((a) => (PUBLICATION_CHANNELS as readonly string[]).includes(a.platform))
      .map(async (account) => {
        try {
          const { identity, capability } = await identityFor(project, account);
          await db
            .update(socialAccounts)
            .set({
              externalId: identity.id ?? account.externalId,
              externalHandle: identity.handle ?? account.externalHandle,
              label: identity.label ?? account.label,
              metadata: {
                ...(account.metadata ?? {}),
                public_identity: identity,
                publish_capability: capability,
              },
              updatedAt: new Date(),
            })
            .where(eq(socialAccounts.id, account.id));
        } catch (error) {
          await db
            .update(socialAccounts)
            .set({
              metadata: {
                ...(account.metadata ?? {}),
                publish_capability: {
                  ready: false,
                  text: false,
                  image: false,
                  video: false,
                  checkedAt: new Date().toISOString(),
                  reason: safeReason(error),
                } satisfies PublishingCapability,
              },
              updatedAt: new Date(),
            })
            .where(eq(socialAccounts.id, account.id));
        }
      }),
  );
}
