import { NextRequest, NextResponse } from 'next/server';
import { resolveAndLog } from '@/lib/story-links';
import { appUrl } from '@/lib/public-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Story link inteligente: lee los query params del visitante, aplica las reglas
// del link maestro, cuenta el click, lo loguea y redirige al destino correcto.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const queryParams: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  try {
    const resolved = await resolveAndLog(slug, {
      params: queryParams,
      referrer: req.headers.get('referer'),
    });
    if (resolved) return NextResponse.redirect(resolved.url, 302);
  } catch {
    /* si algo falla, no dejamos al visitante sin destino */
  }

  let fallback = '/';
  try {
    fallback = appUrl() || '/';
  } catch {
    fallback = '/';
  }
  return NextResponse.redirect(fallback, 302);
}
