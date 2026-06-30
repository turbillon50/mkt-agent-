import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  isConnected,
  isEmailConnected,
  isGoogleAdsConnected,
} from '@/lib/composio';

export const dynamic = 'force-dynamic';

// Estado de conexiones reales — lo consume el sidebar (client) para pintar
// los dots de "Redes conectadas" sin hardcodear. Todo server-side con el
// userId de Clerk; cada función ya falla suave a false si el toolkit no
// está configurado.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { twitter: false, linkedin: false, googleads: false, gmail: false, outlook: false },
      { status: 200 },
    );
  }

  const [twitter, linkedin, googleads, gmail, outlook] = await Promise.all([
    isConnected(userId, 'twitter').catch(() => false),
    isConnected(userId, 'linkedin').catch(() => false),
    isGoogleAdsConnected(userId).catch(() => false),
    isEmailConnected(userId, 'gmail').catch(() => false),
    isEmailConnected(userId, 'outlook').catch(() => false),
  ]);

  return NextResponse.json({ twitter, linkedin, googleads, gmail, outlook }, { status: 200 });
}
