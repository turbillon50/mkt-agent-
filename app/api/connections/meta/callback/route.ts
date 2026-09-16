import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, listPages, longLivedToken, readState } from '@/lib/meta-oauth';
import { canSealSecrets, seal } from '@/lib/secret-box';
import { getProjectById } from '@/lib/projects';
import { currentUserOrNull } from '@/lib/users';
import { stageConnection } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { redeemConnectionLink } from '@/src/projects/links';
import { appOrigin } from '../start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vuelta de Facebook.
 *
 * Aquí NO se conecta nada todavía: se guarda el permiso y la lista de páginas
 * para que el usuario elija. Enganchar la primera página que aparezca sería
 * adivinar, y con clientes que tienen cinco páginas se adivina mal.
 *
 * Esta ruta nunca devuelve una pantalla de error cruda: manda de vuelta a donde
 * venía con un `?error=` en español.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const state = readState(req.nextUrl.searchParams.get('state'));
  const back = state?.back ?? '/projects';

  if (!state) {
    return NextResponse.redirect(
      new URL('/projects?error=La+conexión+caducó.+Vuelve+a+intentarlo.', origin),
    );
  }

  const denied = req.nextUrl.searchParams.get('error');
  if (denied) {
    return NextResponse.redirect(new URL(`${back}?error=No+diste+el+permiso.`, origin));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL(`${back}?error=Facebook+no+devolvió+el+permiso.`, origin));
  }

  if (!canSealSecrets()) {
    return NextResponse.redirect(
      new URL(`${back}?error=Facebook+no+está+disponible+por+ahora.`, origin),
    );
  }

  const user = await currentUserOrNull();
  if (!user) return NextResponse.redirect(new URL('/sign-in', origin));

  try {
    const shortToken = await exchangeCode(origin, code);
    const userToken = await longLivedToken(shortToken);
    const pages = await listPages(userToken);

    if (pages.length === 0) {
      return NextResponse.redirect(
        new URL(`${back}?error=Tu+cuenta+no+administra+ninguna+página.`, origin),
      );
    }

    const project = await getProjectById(state.projectId);
    if (!project) {
      return NextResponse.redirect(new URL('/projects?error=Ese+proyecto+ya+no+existe.', origin));
    }

    // Si viene por enlace de un solo uso, se quema AQUÍ: el permiso ya está
    // dado y es el momento en que deja de ser reutilizable.
    if (state.link) {
      const redeemed = await redeemConnectionLink(state.link, user.clerkId);
      if (!redeemed.ok) {
        return NextResponse.redirect(new URL(`/conectar/${state.link}`, origin));
      }
      await logProjectEvent({
        orgId: project.orgId,
        projectId: project.id,
        type: 'link_used',
        actor: user.clerkId,
        actorEmail: user.email,
        payload: { canal: 'meta' },
      });
    }

    await stageConnection({
      orgId: project.orgId,
      projectId: project.id,
      channel: 'meta',
      connectedBy: user.clerkId,
      userId: user.id,
      metadata: {
        user_token: seal(userToken),
        candidates: pages.map((p) => ({
          id: p.id,
          name: p.name,
          instagram: p.instagram?.username ?? null,
        })),
      },
    });

    return NextResponse.redirect(new URL(`${back}?meta=elegir`, origin));
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'error';
    return NextResponse.redirect(
      new URL(`${back}?error=${encodeURIComponent(detail.slice(0, 160))}`, origin),
    );
  }
}
