import { auth } from '@clerk/nextjs/server';
import { startConnection, startEmailConnection } from '@/lib/composio';
import { NextResponse } from 'next/server';

type Toolkit = 'twitter' | 'linkedin' | 'gmail' | 'outlook';

const SOCIAL: Toolkit[] = ['twitter', 'linkedin'];
const EMAIL: Toolkit[] = ['gmail', 'outlook'];

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { toolkit } = (await req.json()) as { toolkit?: Toolkit };
    if (!toolkit || (!SOCIAL.includes(toolkit) && !EMAIL.includes(toolkit))) {
      return NextResponse.json({ error: 'Invalid toolkit' }, { status: 400 });
    }

    const { redirectUrl } = EMAIL.includes(toolkit)
      ? await startEmailConnection(userId, toolkit as 'gmail' | 'outlook')
      : await startConnection(userId, toolkit as 'twitter' | 'linkedin');

    return NextResponse.json({ redirectUrl }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
