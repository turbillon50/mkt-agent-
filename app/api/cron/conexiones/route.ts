import { NextRequest, NextResponse } from 'next/server';
import { composioReady } from '@/src/composio/client';
import { verifyAllProjects } from '@/src/projects/composio-connections';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * El barrido diario de conexiones (vercel.json, 5:00 UTC).
 *
 * Le pregunta a Composio, cuenta por cuenta, si el permiso sigue vivo, y sella
 * `verified_at`. Sin esto, una conexión que el cliente revocó desde Facebook
 * seguiría pintada de verde hasta que alguien abriera la pantalla — y la regla
 * del issue #33 es justo lo contrario: **nada verde sin verificación de menos
 * de 24 h**. Por eso el cron corre todos los días: es lo que mantiene fresca la
 * verificación de los proyectos que nadie abre.
 *
 * Nunca devuelve 500: una cuenta caída es un dato, no una falla del cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!composioReady()) {
    return NextResponse.json({ ok: true, omitido: 'sin llave de Composio en este entorno' });
  }

  const started = Date.now();
  try {
    const r = await verifyAllProjects();
    return NextResponse.json({
      ok: true,
      proyectos: r.proyectos,
      cuentas: r.cuentas,
      vivas: r.vivas,
      caidas: r.caidas,
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'no se pudo verificar',
      ms: Date.now() - started,
    });
  }
}
