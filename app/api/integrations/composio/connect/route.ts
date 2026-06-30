import { auth } from '@clerk/nextjs/server';
import { startConnection } from '@/lib/composio';
import { NextResponse } from 'next/server';

type Toolkit = 'twitter' | 'linkedin';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { toolkit } = (await req.json()) as { toolkit?: Toolkit };
    if (!toolkit || (toolkit !== 'twitter' && toolkit !== 'linkedin')) {
      return NextResponse.json({ error: 'Invalid toolkit' }, { status: 400 });
    }

    const { redirectUrl } = await startConnection(userId, toolkit);
    return NextResponse.json({ redirectUrl }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
