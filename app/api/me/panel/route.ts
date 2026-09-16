import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';

export const runtime = 'nodejs';

/**
 * El ancho y el plegado del panel de Goossip, por usuario.
 *
 * No lleva `projectId` a propósito: el panel es del USUARIO, no del cliente en
 * el que esté parado. Que el panel cambie de ancho al cambiar de proyecto sería
 * un mueble que se mueve solo.
 */
export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;

  const { leerPreferencias } = await import('@/src/assistant/preferencias');
  return NextResponse.json(leerPreferencias(gate.ctx.user.settings));
}

export async function PATCH(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;

  const cuerpo = await req.json().catch(() => ({}));

  try {
    const { guardarPreferencias } = await import('@/src/assistant/preferencias');
    const nuevas = await guardarPreferencias(gate.ctx.user.id, {
      ancho: typeof cuerpo?.ancho === 'number' ? cuerpo.ancho : undefined,
      plegado: typeof cuerpo?.plegado === 'boolean' ? cuerpo.plegado : undefined,
      autonomia: cuerpo?.autonomia === 'publica' || cuerpo?.autonomia === 'propone' ? cuerpo.autonomia : undefined,
    });
    return NextResponse.json(nuevas);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar.' },
      { status: 500 },
    );
  }
}
