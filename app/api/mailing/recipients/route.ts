import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { countRecipients } from '@/lib/mailing';

export const dynamic = 'force-dynamic';

// Conteo REAL de destinatarios de un segmento, antes de enviar (nada inventado).
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const result = await countRecipients(user.id, body.segment ?? { type: 'all' });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
