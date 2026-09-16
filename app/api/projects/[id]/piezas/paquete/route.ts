import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;
  const body = await req.json().catch(() => ({}));
  const brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  if (brief.length < 4) return NextResponse.json({ error: 'Dime de qué va la publicación.' }, { status: 400 });

  const { esRedPublicable } = await import('@/src/creative/social-playbooks');
  const redes = Array.isArray(body?.redes) ? body.redes.filter(esRedPublicable) : [];
  if (!redes.length) return NextResponse.json({ error: 'Elige al menos una red.' }, { status: 400 });

  const { getBrandKit, palabrasProhibidasEn } = await import('@/src/creative/brand-kit');
  const kit = await getBrandKit(gate.ctx.orgId, id);
  const prohibidas = palabrasProhibidasEn(kit, [brief, body?.cta].filter(Boolean).join(' '));
  if (prohibidas.length) {
    return NextResponse.json(
      { error: `Tu kit de marca prohíbe estas palabras: ${prohibidas.join(', ')}.` },
      { status: 400 },
    );
  }

  try {
    const { generateSocialPack } = await import('@/src/creative/social-pack');
    const pack = await generateSocialPack({
      project: gate.ctx.project,
      kit,
      redes,
      brief,
      angle: typeof body?.angulo === 'string' ? body.angulo : null,
      cta: typeof body?.cta === 'string' ? body.cta : null,
      optionsPerNetwork: Number(body?.opciones) || 2,
    });
    return NextResponse.json({ ok: true, ...pack });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo generar el paquete.' },
      { status: 400 },
    );
  }
}
