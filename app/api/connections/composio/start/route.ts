import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { currentUserOrNull } from '@/lib/users';
import { startComposioConnection } from '@/src/projects/composio-connections';
import { channelAvailable } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { resolveConnectionLink } from '@/src/projects/links';
import { connectorBySlug } from '@/src/projects/catalog';
import { appOrigin } from '../../meta/start/route';
import { normalizeXHandle } from '@/src/projects/account-selection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Arranca la conexión de cualquier conector del catálogo — todos van por
 * Composio con su app administrada.
 *
 * Dos puertas al mismo baile, igual que en Meta:
 *   · POST con `{project, toolkit}` — alguien del proyecto con permiso de
 *     conectar. Devuelve la URL para mandar la pestaña.
 *   · GET `?link=<token>&toolkit=<slug>` — alguien de FUERA con un enlace de un
 *     solo uso. El enlace ES su permiso, y solo para ese proyecto y ese canal.
 *     No se quema aquí: se quema en el callback, cuando el permiso ya está dado.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.project ?? '');
  // `canal` es como lo llamaba la corrida 3; se acepta para no romper nada.
  const toolkit = String(body?.toolkit ?? body?.canal ?? '');
  let replace = body?.replace === true;

  const connector = connectorBySlug(toolkit);
  if (!connector || connector.via !== 'composio') {
    return NextResponse.json({ error: 'conexión desconocida' }, { status: 400 });
  }
  if (!channelAvailable(toolkit)) {
    return NextResponse.json(
      { error: `${connector.label} no está disponible por ahora.` },
      { status: 503 },
    );
  }

  const expectedHandle = toolkit === 'twitter' ? normalizeXHandle(body?.expectedHandle) : null;
  if (toolkit === 'twitter' && !expectedHandle) {
    return NextResponse.json(
      { error: 'Escribe el @usuario exacto de X que quieres conectar.' },
      { status: 400 },
    );
  }
  // X OAuth 2 reutiliza la sesión abierta del navegador y no ofrece un selector
  // de cuenta. Cada intento se trata como reemplazo y se valida el @ al volver.
  if (toolkit === 'twitter') replace = true;

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  try {
    const { redirectUrl, connectedAccountId, alreadyConnected } = await startComposioConnection({
      project: gate.ctx.project,
      toolkit,
      connectedBy: gate.ctx.clerkUserId,
      userId: gate.ctx.user.id,
      baseUrl: appOrigin(req),
      replace,
      expectedHandle,
    });

    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId,
      type: 'channel_connected',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: {
        canal: toolkit,
        paso: replace ? 'cambio de cuenta solicitado' : 'permiso solicitado',
        cuenta: connectedAccountId,
      },
    });

    if (alreadyConnected) return NextResponse.json({ alreadyConnected: true });
    return NextResponse.json({ redirectUrl });
  } catch (e) {
    return NextResponse.json(
      { error: mensajeAmable(e) },
      { status: 400 },
    );
  }
}

/** La entrada de quien llega con un enlace de un solo uso. */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const token = req.nextUrl.searchParams.get('link');
  if (!token) return NextResponse.json({ error: 'falta el enlace' }, { status: 400 });

  const resolution = await resolveConnectionLink(token);
  if (!resolution.ok) {
    return NextResponse.redirect(new URL(`/conectar/${token}`, origin));
  }

  const toolkit = req.nextUrl.searchParams.get('toolkit') ?? resolution.link.channel;
  const connector = connectorBySlug(toolkit);
  if (!connector || connector.via !== 'composio' || !channelAvailable(toolkit)) {
    return NextResponse.redirect(new URL(`/conectar/${token}`, origin));
  }

  // Quién hizo la conexión sí se pregunta: la bitácora del proyecto tiene que
  // poder contestar "¿y esto quién lo enganchó?" con un nombre.
  const user = await currentUserOrNull();
  if (!user) return NextResponse.redirect(new URL(`/conectar/${token}`, origin));

  try {
    // El token del enlace viaja DENTRO del `callback_url` que se le da a
    // Composio, que es lo único que vuelve garantizado: así se puede quemar al
    // regreso aunque la persona termine el permiso en otra pestaña.
    const { redirectUrl } = await startComposioConnection({
      project: resolution.project,
      toolkit,
      connectedBy: user.clerkId,
      userId: user.id,
      baseUrl: origin,
      linkToken: token,
    });
    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(new URL(`/conectar/${token}`, origin));
  }
}

/** Nunca le mostramos al usuario el error crudo de Composio en inglés. */
function mensajeAmable(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/Multiple connected accounts/i.test(raw)) return 'Había intentos anteriores sin terminar. Vuelve a dar Conectar.';
  if (/unauthorized|401|api key/i.test(raw)) return 'Goossip no pudo hablar con el proveedor de conexiones. Avísanos.';
  if (/no está disponible/i.test(raw)) return raw;
  console.error('[composio/start]', raw);
  return 'No se pudo iniciar la conexión. Intenta de nuevo.';
}
