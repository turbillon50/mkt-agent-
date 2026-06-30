import { NextRequest, NextResponse } from 'next/server';
import { registerConversionBySlug } from '@/lib/flash-offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Postback de conversion: el destino (gracias/pago) hace ping aqui para contar
// la conversion real. GET o POST, ambos sirven (pixel o fetch).
async function handle(slug: string) {
  try {
    const ok = await registerConversionBySlug(slug);
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(slug);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(slug);
}
