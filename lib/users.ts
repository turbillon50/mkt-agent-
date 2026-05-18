import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { users, type User } from '@/src/db/schema';
import { isAdminEmail } from './admin';

const PLATFORMS: Array<'twitter' | 'linkedin' | 'whatsapp'> = ['twitter', 'linkedin', 'whatsapp'];

export async function getOrCreateUser(): Promise<User | null> {
  const { auth, currentUser } = await import('@clerk/nextjs/server');
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (existing[0]) return existing[0];

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress ??
    `${clerkId}@unknown.local`;

  const [row] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
      username: clerkUser.username ?? null,
      imageUrl: clerkUser.imageUrl ?? null,
      isAdmin: isAdminEmail(email),
    })
    .returning();

  if (row) {
    const { socialAccounts } = await import('@/src/db/schema');
    await db
      .insert(socialAccounts)
      .values(PLATFORMS.map((p) => ({ userId: row.id, platform: p, status: 'disconnected' })))
      .onConflictDoNothing()
      .catch(() => undefined);
  }

  return row ?? null;
}

export async function currentUserOrNull(): Promise<User | null> {
  try {
    return await getOrCreateUser();
  } catch {
    return null;
  }
}
