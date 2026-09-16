import { NextRequest, NextResponse } from 'next/server';
import { readState } from '@/lib/meta-oauth';
import { exchangeAdsCode, listAdAccounts, longLivedAdsToken, motivoDeMeta } from '@/lib/meta-ads';
import { canSealSecrets, seal } from '@/lib/secret-box';
import { getProjectById } from '@/lib/projects';
import { currentUserOrNull } from '@/lib/users';
import { stageConnection } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { redeemConnectionLink } from '@/src/projects/links';
import { appOrigin } from '../../meta/start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vuelta de Facebook con el permiso de anuncios.
 *
 * Aquí NO queda conectado nada todavía: se guarda el permiso cifrado y la lista
 * de cuentas publicitarias para que el usuario elija. Enganchar la primera que
 * aparezca sería adivinar, y con una agencia que administra seis cuentas se
 * adivina mal — le reportaríamos a un cliente el gasto de otro.
 *
 * Nunca devuelve una pantalla de error cruda: manda de vuelta a donde venía con
 * un `?error=` en español.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const state = readState(req.nextUrl.searchParams.get('state'));
  const back = state?.back ?? '/projects';

  if (!state || state.via !== 'ads') {
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

  // Sin con qué cifrar no se guarda el token, y sin token no hay lectura. Se
  // para ANTES de pedirle nada a Meta: no tiene sentido emitir un permiso de 60
  // días que vamos a tirar.
  if (!canSealSecrets()) {
    return NextResponse.redirect(
      new URL(`${back}?error=Meta+Ads+no+está+disponible+por+ahora.`, origin),
    );
  }

  const user = await currentUserOrNull();
  if (!user) return NextResponse.redirect(new URL('/sign-in', origin));

  try {
    const shortToken = await exchangeAdsCode(origin, code);
    const userToken = await longLivedAdsToken(shortToken);
    const cuentas = await listAdAccounts(userToken);

    if (cuentas.length === 0) {
      return NextResponse.redirect(
        new URL(
          `${back}?error=${encodeURIComponent(
            'Tu usuario no administra ninguna cuenta publicitaria. Pide acceso en Business Manager.',
          )}`,
          origin,
        ),
      );
    }

    const project = await getProjectById(state.projectId);
    if (!project) {
      return NextResponse.redirect(new URL('/projects?error=Ese+proyecto+ya+no+existe.', origin));
    }

    // El enlace de un solo uso se quema AQUÍ: el permiso ya está dado y es el
    // momento en que deja de ser reutilizable.
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
        payload: { canal: 'metaads' },
      });
    }

    await stageConnection({
      orgId: project.orgId,
      projectId: project.id,
      channel: 'metaads',
      connectedBy: user.clerkId,
      userId: user.id,
      metadata: {
        user_token: seal(userToken),
        candidates: cuentas.map((c) => ({
          id: c.id,
          accountId: c.accountId,
          name: c.name,
          business: c.business,
          currency: c.currency,
          status: c.status,
        })),
      },
    });

    return NextResponse.redirect(new URL(`${back}?metaads=elegir`, origin));
  } catch (e) {
    return NextResponse.redirect(
      new URL(`${back}?error=${encodeURIComponent(motivoDeMeta(e))}`, origin),
    );
  }
}
