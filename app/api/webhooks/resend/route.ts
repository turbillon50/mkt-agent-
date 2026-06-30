import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { recordResendEvent } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook de Resend (tarea 681 punto 4): recibe delivered/opened/clicked/
// bounced/complained y los guarda para el tracking real de cada campaña.
//
// Resend firma con Svix. Si RESEND_WEBHOOK_SECRET está configurado, validamos
// la firma; si no, procesamos igual (PENDIENTE: pedirle a Luis el secret del
// webhook en el panel de Resend, igual que se hizo con RESEND_API_KEY).
function verifySvix(secret: string, headers: Headers, payload: string): boolean {
  try {
    const id = headers.get('svix-id');
    const timestamp = headers.get('svix-timestamp');
    const sigHeader = headers.get('svix-signature');
    if (!id || !timestamp || !sigHeader) return false;
    const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const secretBytes = Buffer.from(key, 'base64');
    const signed = `${id}.${timestamp}.${payload}`;
    const expected = crypto.createHmac('sha256', secretBytes).update(signed).digest('base64');
    // El header trae "v1,<sig> v1,<sig2>" — basta que UNA coincida.
    return sigHeader.split(' ').some((part) => {
      const sig = part.includes(',') ? part.split(',')[1] : part;
      try {
        return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(secret, req.headers, raw)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 });
  }

  try {
    const result = await recordResendEvent(payload as any);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
