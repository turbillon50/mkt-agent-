import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let dbUser: { id: string; isAdmin: boolean } | null = null;
  let clerkUserId: string | null = null;

  if (isClerkConfigured()) {
    try {
      const { getOrCreateUser } = await import('@/lib/users');
      const user = await getOrCreateUser();
      if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      dbUser = { id: user.id, isAdmin: user.isAdmin };
      const { userId } = await auth();
      clerkUserId = userId;
    } catch {
      return NextResponse.json({ error: 'auth failed' }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const platform = body?.platform === 'linkedin' ? 'linkedin' : body?.platform === 'twitter' ? 'twitter' : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const topic = typeof body?.topic === 'string' ? body.topic : undefined;

  if (!platform) return NextResponse.json({ error: 'platform inválido' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'texto vacío' }, { status: 400 });

  try {
    const { db } = await import('@/src/db/client');
    const { posts } = await import('@/src/db/schema');

    let externalId: string | undefined;
    let externalUrl: string | undefined;

    if (platform === 'linkedin' && clerkUserId) {
      // Multi-tenant real: si el usuario tiene su propio LinkedIn conectado
      // via Composio, publica en SU cuenta. Nunca asumimos que es la cuenta
      // de la casa solo porque alguien dio click.
      const { isConnected, postLinkedInForUser } = await import('@/lib/composio');
      const connected = await isConnected(clerkUserId, 'linkedin').catch(() => false);
      if (connected) {
        const out = await postLinkedInForUser(clerkUserId, text);
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
          { error: 'Conecta tu cuenta de LinkedIn en Integraciones antes de publicar.' },
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
    } else {
      return NextResponse.json({ error: 'No se pudo identificar tu sesión.' }, { status: 401 });
    }

    const [row] = await db
      .insert(posts)
      .values({
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
