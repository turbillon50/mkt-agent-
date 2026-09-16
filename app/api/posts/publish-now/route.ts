import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Publicar de verdad, ahora mismo.
 *
 * Desde la corrida 5 el camino normal es el del PROYECTO por Composio: se
 * publica en la cuenta que el cliente autorizó para ese proyecto. El camino
 * viejo —las cuentas de la casa con tokens en el entorno— solo se usa con
 * `META_OWN_APP=true`, que está apagado. Así nadie llama a Graph con
 * credenciales nuestras sin que alguien lo encienda a propósito.
 */
const TOOLKIT_DE: Record<string, string> = {
  meta: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  twitter: 'twitter',
};

export async function POST(req: NextRequest) {
  let dbUser: { id: string; isAdmin: boolean } | null = null;
  let clerkUserId: string | null = null;
  // `posts.org_id` es NOT NULL desde la migración 0013: sin org activa no hay
  // dónde guardar la publicación.
  let orgId: string | null = null;
  let activeProjectId: string | null = null;

  if (isClerkConfigured()) {
    try {
      const { apiOrg } = await import('@/lib/org');
      const gate = await apiOrg();
      if (!gate.ok) return gate.res;
      dbUser = { id: gate.ctx.user.id, isAdmin: gate.ctx.user.isAdmin };
      orgId = gate.ctx.orgId;
      activeProjectId = gate.ctx.activeProjectId ?? null;
      const { userId } = await auth();
      clerkUserId = userId;
    } catch {
      return NextResponse.json({ error: 'auth failed' }, { status: 401 });
    }
  }
  if (!orgId) {
    return NextResponse.json({ error: 'sin organización activa' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const platform = body?.platform === 'linkedin' ? 'linkedin' : body?.platform === 'twitter' ? 'twitter' : body?.platform === 'meta' ? 'meta' : body?.platform === 'instagram' ? 'instagram' : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const topic = typeof body?.topic === 'string' ? body.topic : undefined;
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : undefined;

  if (!platform) return NextResponse.json({ error: 'platform inválido' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'texto vacío' }, { status: 400 });

  // --- Camino normal: la cuenta del proyecto, por Composio -----------------
  const { metaOwnAppEnabled } = await import('@/src/projects/catalog');
  if (!metaOwnAppEnabled()) {
    if (!activeProjectId) {
      return NextResponse.json(
        { error: 'Entra a un proyecto para publicar: las cuentas son del proyecto.' },
        { status: 400 },
      );
    }
    const { getProject } = await import('@/src/sales/projects');
    const project = await getProject(orgId, activeProjectId);
    if (!project) {
      return NextResponse.json({ error: 'no encontramos tu proyecto activo' }, { status: 404 });
    }
    const { requireProjectCapability } = await import('@/lib/project-access');
    const denied = await requireProjectCapability(project.id, 'operar');
    if (denied) return denied;

    try {
      const { publishTo } = await import('@/src/channels');
      const out = await publishTo(project, TOOLKIT_DE[platform], {
        texto: text,
        media: imageUrl ?? null,
      });
      const { db } = await import('@/src/db/client');
      const { posts } = await import('@/src/db/schema');
      const [row] = await db
        .insert(posts)
        .values({
          orgId,
          platform,
          text,
          topic: topic ?? null,
          externalId: out.id,
          externalUrl: out.url,
          publishedAt: new Date(),
        })
        .returning({ id: posts.id });
      return NextResponse.json({ ok: true, externalUrl: out.url, postId: row?.id ?? null });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se pudo publicar.' },
        { status: 400 },
      );
    }
  }

  // --- Camino viejo: cuentas de la casa, solo con META_OWN_APP=true --------
  try {
    const { db } = await import('@/src/db/client');
    const { posts } = await import('@/src/db/schema');

    let externalId: string | undefined;
    let externalUrl: string | undefined;

    if (platform === 'linkedin' && clerkUserId) {
      // Multi-tenant real: si el usuario tiene su propio LinkedIn conectado
      // via Composio, publica en SU cuenta. Nunca asumimos que es la cuenta
      // de la casa solo porque alguien dio click.
      // La identidad del canal es la del PROYECTO activo (project:<id>), nunca
      // la del usuario: la cuenta pertenece al proyecto y la comparte su equipo.
      const { isConnected, postLinkedInForUser } = await import('@/lib/composio');
      const { composioUserId } = await import('@/src/projects/connections');
      const { users } = await import('@/src/db/schema');
      const { eq } = await import('drizzle-orm');
      const [me] = dbUser
        ? await db.select({ active: users.activeCampaignId }).from(users).where(eq(users.id, dbUser.id)).limit(1)
        : [];
      const projectId = typeof body?.project === 'string' && body.project ? body.project : me?.active ?? null;
      const canalId = projectId ? composioUserId(projectId) : null;
      const connected = canalId ? await isConnected(canalId, 'linkedin').catch(() => false) : false;
      if (connected && canalId) {
        const out = await postLinkedInForUser(canalId, text);
        externalId = out.id;
        externalUrl = out.url;
      } else if (dbUser?.isAdmin) {
        // Fallback: solo para el owner, usando la cuenta de la casa (env vars).
        const { getPoster } = await import('@/src/posters/index');
        const out = await getPoster('linkedin').post(text);
        externalId = out.id;
        externalUrl = out.url;
      } else {
        return NextResponse.json(
          { error: 'Este proyecto no tiene LinkedIn conectado. Conéctalo en Conexiones del proyecto.' },
          { status: 400 },
        );
      }
    } else if (platform === 'twitter') {
      // X/Twitter aun no tiene auth_config multi-tenant en Composio (requiere
      // app propia de Twitter Developer por usuario). Solo el owner puede
      // publicar por ahora, usando la cuenta de la casa.
      if (dbUser?.isAdmin) {
        const { getPoster } = await import('@/src/posters/index');
        const out = await getPoster('twitter').post(text);
        externalId = out.id;
        externalUrl = out.url;
      } else {
        return NextResponse.json(
          { error: 'X todavía no soporta cuentas por usuario — contacta al admin.' },
          { status: 400 },
        );
      }
    } else if (platform === 'meta') {
      // Meta (Facebook/Instagram) es una sola pagina de la casa via
      // Graph API oficial (token de pagina, se refresca solo). Solo el
      // owner puede publicar por ahora; el flujo por-usuario (cada quien
      // conecta su propio Facebook) es trabajo futuro.
      if (dbUser?.isAdmin) {
        const { getPoster } = await import('@/src/posters/index');
        const out = await getPoster('meta').post(text, imageUrl);
        externalId = out.id;
        externalUrl = out.url;
      } else {
        return NextResponse.json(
          { error: 'Meta todavía no soporta cuentas por usuario — contacta al admin.' },
          { status: 400 },
        );
      }
    } else if (platform === 'instagram') {
      if (!imageUrl) {
        return NextResponse.json(
          { error: 'Instagram necesita una imagen — sube una foto antes de publicar.' },
          { status: 400 },
        );
      }
      if (dbUser?.isAdmin) {
        const { postInstagram } = await import('@/src/posters/meta');
        const out = await postInstagram(imageUrl, text);
        externalId = out.id;
        externalUrl = 'https://instagram.com';
      } else {
        return NextResponse.json(
          { error: 'Instagram todavía no soporta cuentas por usuario — contacta al admin.' },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json({ error: 'No se pudo identificar tu sesión.' }, { status: 401 });
    }

    const [row] = await db
      .insert(posts)
      .values({
        orgId,
        platform,
        text,
        topic: topic ?? null,
        externalId: externalId ?? null,
        externalUrl: externalUrl ?? null,
        publishedAt: new Date(),
      })
      .returning({ id: posts.id });

    return NextResponse.json({ ok: true, externalUrl: externalUrl ?? null, postId: row?.id ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo publicar.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
