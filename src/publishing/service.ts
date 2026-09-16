import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  posts,
  publicationAttempts,
  socialAccounts,
  type Project,
} from '../db/schema';
import { publishTo } from '../channels';
import { activeAccountFor } from '../projects/composio-connections';
import { ComposioError } from '../composio/client';
import { marcarPublicada } from '../creative/repo';
import { sanitizePublicationError } from './errors';

export interface PublishForProjectInput {
  orgId: string;
  project: Project;
  platform: string;
  text: string;
  topic?: string | null;
  media?: string | null;
  pieceId?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Única puerta para publicar y registrar el recibo. La ruta HTTP y el agente
 * usan esta misma función para que no existan dos verdades distintas.
 */
export async function publishForProject(input: PublishForProjectInput) {
  const { project, platform } = input;
  const text = input.text.trim();
  if (!text) throw new Error('El texto está vacío.');

  const account = await activeAccountFor(project, platform).catch(() => null);
  if (!account) {
    throw new Error(`${project.name} no tiene ${platform} conectado y listo para publicar.`);
  }
  if (platform === 'instagram' && !input.media) {
    throw new Error('Instagram no deja publicar sin una pieza visual aprobada.');
  }

  const [localAccount] = await db
    .select({
      handle: socialAccounts.externalHandle,
      externalId: socialAccounts.externalId,
      label: socialAccounts.label,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, input.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.platform, platform),
      ),
    )
    .limit(1);

  const [attempt] = await db
    .insert(publicationAttempts)
    .values({
      orgId: input.orgId,
      projectId: project.id,
      platform,
      pieceId: input.pieceId ?? null,
      accountHandle: localAccount?.handle ?? localAccount?.label ?? null,
      accountExternalId: localAccount?.externalId ?? null,
      metadata: {
        actor: input.actor ?? null,
        hasMedia: Boolean(input.media),
        ...(input.metadata ?? {}),
      },
    })
    .returning({ id: publicationAttempts.id });

  const attemptId = attempt!.id;
  console.info('[publication]', {
    attemptId,
    projectId: project.id,
    platform,
    stage: 'provider',
    hasMedia: Boolean(input.media),
  });

  try {
    await db
      .update(publicationAttempts)
      .set({ stage: 'provider' })
      .where(eq(publicationAttempts.id, attemptId));

    const out = await publishTo(project, platform, { texto: text, media: input.media ?? null });

    const [post] = await db
      .insert(posts)
      .values({
        orgId: input.orgId,
        projectId: project.id,
        platform,
        text,
        topic: input.topic ?? null,
        externalId: out.id,
        externalUrl: out.url,
        publishedAt: new Date(),
        metadata: {
          publicadoPor: input.actor ?? null,
          piezaId: input.pieceId ?? null,
          publicationAttemptId: attemptId,
          ...(input.metadata ?? {}),
        },
      })
      .returning({ id: posts.id });

    if (input.pieceId) await marcarPublicada(input.pieceId, post?.id ?? null);

    await db
      .update(publicationAttempts)
      .set({
        status: 'published',
        stage: 'complete',
        postId: post?.id ?? null,
        externalId: out.id,
        externalUrl: out.url,
        completedAt: new Date(),
      })
      .where(eq(publicationAttempts.id, attemptId));

    console.info('[publication]', {
      attemptId,
      projectId: project.id,
      platform,
      status: 'published',
      externalId: out.id,
    });

    return { ...out, postId: post?.id ?? null, attemptId };
  } catch (error) {
    const message = sanitizePublicationError(error);
    const providerCode =
      error instanceof ComposioError
        ? [error.code, error.status].filter((v) => v !== undefined).join(':')
        : null;

    await db
      .update(publicationAttempts)
      .set({
        status: 'failed',
        stage: 'failed',
        providerCode,
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(eq(publicationAttempts.id, attemptId))
      .catch(() => undefined);

    console.error('[publication]', {
      attemptId,
      projectId: project.id,
      platform,
      status: 'failed',
      providerCode,
      message,
    });
    throw new Error(message);
  }
}
