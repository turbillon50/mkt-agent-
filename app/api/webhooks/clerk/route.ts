import { NextRequest, NextResponse } from 'next/server';
import { verifySvix } from '@/lib/svix';
import {
  deleteMembership,
  deleteOrg,
  logWebhook,
  upsertMembership,
  upsertOrg,
} from '@/src/orgs/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Espejo de Clerk → tabla `organizations` / `org_memberships`.
 *
 * Eventos que importan:
 *   organization.created / updated / deleted
 *   organizationMembership.created / updated / deleted
 *
 * Siempre 200 cuando la firma es buena, aunque adentro falle algo: si
 * devolvemos 5xx, Svix reintenta en bucle. Lo que falló queda en `webhook_log`
 * y se ve en /admin → Salud.
 */
export async function POST(req: NextRequest) {
  // Cuerpo CRUDO: la firma es sobre los bytes exactos.
  const raw = await req.text();
  const check = verifySvix(
    raw,
    {
      id: req.headers.get('svix-id'),
      timestamp: req.headers.get('svix-timestamp'),
      signature: req.headers.get('svix-signature'),
    },
    process.env.CLERK_WEBHOOK_SECRET,
  );

  if (!check.ok) {
    await logWebhook({ source: 'clerk', event: 'firma', status: 'rejected', detail: check.reason });
    const status = check.reason === 'sin_secreto' ? 500 : 401;
    return NextResponse.json({ error: check.reason }, { status });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    await logWebhook({ source: 'clerk', event: 'json', status: 'error', detail: 'json inválido' });
    return NextResponse.json({ error: 'json inválido' }, { status: 400 });
  }

  const type = String(event.type ?? '');
  const data = (event.data ?? {}) as Record<string, any>;

  try {
    switch (type) {
      case 'organization.created':
      case 'organization.updated': {
        await upsertOrg({
          id: String(data.id),
          name: String(data.name ?? 'Organización'),
          slug: data.slug ? String(data.slug) : null,
          ownerUserId: data.created_by ? String(data.created_by) : null,
          createdAt: data.created_at ? new Date(Number(data.created_at)) : undefined,
        });
        break;
      }

      case 'organization.deleted': {
        await deleteOrg(String(data.id));
        break;
      }

      case 'organizationMembership.created':
      case 'organizationMembership.updated': {
        const orgId = String(data.organization?.id ?? '');
        const clerkUserId = String(data.public_user_data?.user_id ?? '');
        if (!orgId || !clerkUserId) throw new Error('membresía sin org o sin usuario');
        // La org puede no estar espejada todavía si los eventos llegan fuera de
        // orden: se crea con lo que viene en el propio payload.
        if (data.organization?.name) {
          await upsertOrg({
            id: orgId,
            name: String(data.organization.name),
            slug: data.organization.slug ? String(data.organization.slug) : null,
            ownerUserId: data.organization.created_by ? String(data.organization.created_by) : null,
          });
        }
        await upsertMembership({
          id: String(data.id),
          orgId,
          clerkUserId,
          email: data.public_user_data?.identifier ? String(data.public_user_data.identifier) : null,
          role: data.role ? String(data.role) : null,
        });
        break;
      }

      case 'organizationMembership.deleted': {
        const orgId = String(data.organization?.id ?? '');
        const clerkUserId = String(data.public_user_data?.user_id ?? '');
        if (orgId && clerkUserId) await deleteMembership(orgId, clerkUserId);
        break;
      }

      default:
        await logWebhook({ source: 'clerk', event: type, status: 'ok', detail: 'evento ignorado' });
        return NextResponse.json({ ok: true, ignorado: type });
    }

    await logWebhook({
      source: 'clerk',
      event: type,
      status: 'ok',
      orgId: String(data.organization?.id ?? data.id ?? '') || null,
    });
    return NextResponse.json({ ok: true, type });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'error';
    await logWebhook({ source: 'clerk', event: type, status: 'error', detail });
    // 200 a propósito: el reintento de Svix no va a arreglar un error nuestro.
    return NextResponse.json({ ok: false, type, error: detail });
  }
}
