import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { users, type User } from '@/src/db/schema';
import { isAdminEmail } from './admin';

const PLATFORMS: Array<'twitter' | 'linkedin' | 'whatsapp'> = ['twitter', 'linkedin', 'whatsapp'];

export async function getOrCreateUser(): Promise<User | null> {
  const { auth, currentUser } = await import('@clerk/nextjs/server');
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (existing[0]) {
    // Último acceso: es la columna que /admin usa para saber quién sigue vivo.
    // Se escribe a lo mucho una vez cada 5 min para no pagar un UPDATE por
    // cada petición del dashboard.
    const last = existing[0].lastSeenAt?.getTime() ?? 0;
    if (Date.now() - last > 5 * 60 * 1000) {
      const now = new Date();
      await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, existing[0].id)).catch(() => undefined);
      return { ...existing[0], lastSeenAt: now };
    }
    return existing[0];
  }

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
      lastSeenAt: new Date(),
    })
    .returning();

  // `social_accounts` ya lleva org_id NOT NULL: sin org activa no hay dónde
  // colgarlas. Se crean cuando el usuario ya está parado en una organización.
  return row ?? null;
}

/**
 * Cuentas sociales por defecto de la org. Se llaman al entrar con org activa,
 * no al crear el usuario: antes no se sabe a qué tenant pertenecen.
 */
export async function ensureSocialAccounts(orgId: string, userId: string): Promise<void> {
  const { socialAccounts } = await import('@/src/db/schema');
  const existing = await db
    .select({ platform: socialAccounts.platform })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.userId, userId)));
  const have = new Set(existing.map((r) => r.platform));
  const missing = PLATFORMS.filter((p) => !have.has(p));
  if (missing.length === 0) return;
  await db
    .insert(socialAccounts)
    .values(missing.map((p) => ({ orgId, userId, platform: p, status: 'disconnected' })))
    .onConflictDoNothing()
    .catch(() => undefined);
}

export async function currentUserOrNull(): Promise<User | null> {
  try {
    return await getOrCreateUser();
  } catch {
    return null;
  }
}
