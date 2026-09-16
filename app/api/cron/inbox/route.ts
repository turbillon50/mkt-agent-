import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * La bandeja social, cada 2 minutos (vercel.json).
 *
 * Poll y no webhook a propósito: los webhooks de Messenger exigen una app
 * propia REVISADA por Meta, con su `verify_token` y su suscripción por página.
 * Goossip conecta por la app administrada de Composio justo para que un cliente
 * nuevo no tenga que pasar por eso. Dos minutos es más que suficiente para una
 * bandeja que atiende un humano, y el día que haya app propia aprobada el
 * webhook entra por la misma puerta de abajo y esto se apaga.
 *
 * Nunca devuelve 500: un proyecto con Facebook caído no puede dejar sin
 * sincronizar a los demás.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const { sincronizarTodas } = await import('@/src/projects/bandeja-social');
    const r = await sincronizarTodas();
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'error',
      ms: Date.now() - t0,
    });
  }
}
