import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { updateProject } from '@/lib/projects';
import {
  projectConnections,
  revokeConnection,
  saveConnection,
} from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { connectorBySlug, connectorMode } from '@/src/projects/catalog';
import { revokeComposioConnection } from '@/src/projects/composio-connections';
import { isConnectionChannel, type ConnectionChannel } from '@/src/projects/types';
import { sanitizeChannels, sanitizeMcpSources } from '@/src/sales/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Conectar un canal que se engancha con DATOS (no con OAuth): WhatsApp, el
 * catálogo y el formulario del sitio. Los de OAuth entran por
 * `/api/connections/<canal>/start` y vuelven por su callback.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; channel: string }> },
) {
  const { id, channel } = await params;
  if (!isConnectionChannel(channel)) {
    return NextResponse.json({ error: 'canal desconocido' }, { status: 404 });
  }
  const gate = await apiProject(id, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  if (connectorMode(channel) === 'oauth') {
    return NextResponse.json(
      { error: 'este canal se conecta desde su propia ventana' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));

  try {
    const detalle = await conectar(channel, {
      orgId,
      projectId: id,
      slug: project.slug,
      clerkUserId,
      userId: user.id,
      body,
      channels: (project.channels ?? {}) as Record<string, unknown>,
      mcpSources: project.mcpSources ?? [],
    });

    await logProjectEvent({
      orgId,
      projectId: id,
      type: 'channel_connected',
      actor: clerkUserId,
      actorEmail: user.email,
      payload: { canal: channel, ...detalle },
    });

    const fresh = await apiProject(id, { section: 'conexiones' });
    const connections = fresh.ok ? await projectConnections(fresh.ctx.project) : null;
    return NextResponse.json({ ok: true, ...(connections ?? {}) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo conectar.' },
      { status: 400 },
    );
  }
}

async function conectar(
  channel: ConnectionChannel,
  ctx: {
    orgId: string;
    projectId: string;
    slug: string;
    clerkUserId: string;
    userId: string;
    body: Record<string, unknown>;
    channels: Record<string, unknown>;
    mcpSources: unknown[];
  },
): Promise<Record<string, unknown>> {
  switch (channel) {
    case 'whatsapp': {
      const phoneId = String(ctx.body.waba_phone_id ?? '').trim();
      if (!/^\d{6,}$/.test(phoneId)) {
        throw new Error('Escribe el identificador de tu número de WhatsApp Business.');
      }
      await updateProject(ctx.orgId, ctx.projectId, {
        channels: sanitizeChannels({ ...ctx.channels, waba_phone_id: phoneId }),
      });
      await saveConnection({
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        channel: 'whatsapp',
        connectedBy: ctx.clerkUserId,
        userId: ctx.userId,
        label: `Número ${phoneId}`,
        externalHandle: phoneId,
      });
      return { numero: phoneId };
    }

    case 'mcp': {
      const url = String(ctx.body.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('La dirección de tu catálogo debe empezar con https.');
      const label = String(ctx.body.label ?? '').trim() || hostOf(url);
      const sources = sanitizeMcpSources([...(ctx.mcpSources as unknown[]), { label, url }]);
      await updateProject(ctx.orgId, ctx.projectId, { mcpSources: sources });
      await saveConnection({
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        channel: 'mcp',
        connectedBy: ctx.clerkUserId,
        userId: ctx.userId,
        label,
      });
      return { fuentes: sources.length };
    }

    case 'sitio': {
      // El token viaja DENTRO de la URL que el usuario pega en su sitio, así
      // que tiene que poder verlo: no es un secreto de terceros, es la puerta
      // de entrada que Goossip le genera y que puede rehacer cuando quiera.
      const token = randomBytes(24).toString('base64url');
      await saveConnection({
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        channel: 'sitio',
        connectedBy: ctx.clerkUserId,
        userId: ctx.userId,
        label: 'Formulario de tu sitio',
        externalId: token,
      });
      return { renovado: true };
    }

    default:
      throw new Error('Este canal no se conecta así.');
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Desconectar. La fila NO se borra: quién la conectó es parte de la bitácora. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; channel: string }> },
) {
  const { id, channel } = await params;
  if (!isConnectionChannel(channel)) {
    return NextResponse.json({ error: 'canal desconocido' }, { status: 404 });
  }
  const gate = await apiProject(id, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  // Lo de Composio se borra TAMBIÉN allá. Quitarlo solo de nuestra tabla
  // dejaría al cliente con un permiso vivo en Facebook que Goossip ya no
  // enseña: lo peor de los dos mundos.
  let borradaEnComposio = false;
  if (connectorBySlug(channel)?.via === 'composio') {
    ({ borradaEnComposio } = await revokeComposioConnection(project, channel).catch(() => ({
      borradaEnComposio: false,
    })));
  } else {
    await revokeConnection(orgId, id, channel);
  }

  // Los ids públicos que vivían en el proyecto también se van: dejarlos haría
  // que el webhook siguiera resolviendo a un proyecto ya desconectado.
  if (channel === 'meta') {
    await updateProject(orgId, id, {
      channels: sanitizeChannels({
        ...(project.channels ?? {}),
        meta_page_id: '',
        meta_form_ids: [],
      }),
    });
  }
  if (channel === 'whatsapp') {
    await updateProject(orgId, id, {
      channels: sanitizeChannels({ ...(project.channels ?? {}), waba_phone_id: '' }),
    });
  }
  if (channel === 'mcp') {
    await updateProject(orgId, id, { mcpSources: [] });
  }

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'channel_revoked',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { canal: channel, en_composio: borradaEnComposio },
  });

  const fresh = await apiProject(id, { section: 'conexiones' });
  const connections = fresh.ok ? await projectConnections(fresh.ctx.project) : null;
  return NextResponse.json({ ok: true, ...(connections ?? {}) });
}
