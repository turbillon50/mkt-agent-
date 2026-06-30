import { NextRequest, NextResponse } from 'next/server';
import { registerClickBySlug } from '@/lib/flash-offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// CTA publico: cuenta el click y redirige al destino real de la oferta.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const destination = await registerClickBySlug(slug);
    if (destination) return NextResponse.redirect(destination, 302);
  } catch {
    /* si falla el conteo, no rompemos la experiencia del visitante */
  }
  return NextResponse.redirect(new URL('/', _req.url), 302);
}
