import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Sube el logo y devuelve la propuesta de kit.
 *
 * Dos cosas en una llamada a propósito: el logo se guarda en el almacén de
 * medios de la casa (la URL pública es la que va a acabar dentro de cada pieza)
 * y, con el mismo archivo ya en la mano, Gemini lo mira y propone paleta y
 * tono. Partirlo en dos llamadas obligaría a subir la imagen dos veces.
 *
 * No guarda nada en el kit: la propuesta va de vuelta a la pantalla, el usuario
 * la corrige y es el PUT de `/marca` el que la vuelve el kit del proyecto.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'marca', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const dataUrl = typeof body?.logoDataUrl === 'string' ? body.logoDataUrl : '';
  if (!dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Sube una imagen del logo.' }, { status: 400 });
  }

  const { deDataUrl, subirImagen, almacenListo } = await import('@/src/creative/media');
  const bytes = deDataUrl(dataUrl);
  if (!bytes) {
    return NextResponse.json({ error: 'Ese archivo no se pudo leer como imagen.' }, { status: 400 });
  }
  if (bytes.buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'El logo pesa demasiado: máximo 6 MB.' }, { status: 400 });
  }

  let logoUrl: string | null = null;
  if (almacenListo()) {
    logoUrl = await subirImagen(bytes.buf, bytes.ext).catch(() => null);
  }

  try {
    const { proponerKit } = await import('@/src/creative/proponer-kit');
    const propuesta = await proponerKit({
      logoDataUrl: dataUrl,
      nombreProyecto: gate.ctx.project.name,
      giro: gate.ctx.project.kind,
      sitio: gate.ctx.project.website,
    });
    return NextResponse.json({ ok: true, logoUrl, propuesta });
  } catch (e) {
    // El logo ya se guardó: aunque la lectura falle, el usuario no tiene que
    // volver a subirlo — llena la paleta a mano y sigue.
    return NextResponse.json(
      {
        ok: false,
        logoUrl,
        error: e instanceof Error ? e.message : 'No se pudo leer el logo.',
      },
      { status: 200 },
    );
  }
}
