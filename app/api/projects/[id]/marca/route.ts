import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * El kit de marca del proyecto.
 *
 * GET  → lo que hay hoy (lo ve cualquiera que vea el proyecto).
 * PUT  → guardarlo. Pide 'operar': el kit es lo que sale en todas las piezas
 *        del cliente, y un `lector` no le cambia la marca a nadie.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'marca', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { getBrandKit, kitCompleto } = await import('@/src/creative/brand-kit');
  const kit = await getBrandKit(gate.ctx.orgId, id);

  return NextResponse.json({
    kit: kit
      ? {
          logoUrl: kit.logoUrl,
          logoOscuroUrl: kit.logoOscuroUrl,
          paleta: kit.paleta,
          tipografias: kit.tipografias,
          tono: kit.tono,
          palabrasProhibidas: kit.palabrasProhibidas,
          ejemplos: kit.ejemplos,
          soulId: kit.soulId,
          aprobadoPor: kit.aprobadoPor,
          aprobadoEn: kit.aprobadoEn?.toISOString() ?? null,
        }
      : null,
    completo: kitCompleto(kit),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'marca', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const { saveBrandKit } = await import('@/src/creative/brand-kit');

  try {
    const kit = await saveBrandKit(
      gate.ctx.orgId,
      id,
      {
        logoUrl: typeof body?.logoUrl === 'string' ? body.logoUrl : null,
        logoOscuroUrl: typeof body?.logoOscuroUrl === 'string' ? body.logoOscuroUrl : null,
        paleta: body?.paleta,
        tipografias: body?.tipografias,
        tono: typeof body?.tono === 'string' ? body.tono : null,
        palabrasProhibidas: body?.palabrasProhibidas,
        ejemplos: Array.isArray(body?.ejemplos) ? body.ejemplos : [],
        soulId: typeof body?.soulId === 'string' ? body.soulId : null,
        ...(body?.propuesta ? { propuesta: body.propuesta } : {}),
      },
      gate.ctx.user.email ?? gate.ctx.clerkUserId,
    );
    return NextResponse.json({
      ok: true,
      kit: { ...kit, aprobadoEn: kit.aprobadoEn?.toISOString() ?? null },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar el kit.' },
      { status: 400 },
    );
  }
}
