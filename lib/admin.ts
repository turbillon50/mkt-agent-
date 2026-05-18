/**
 * Admin recognition based on email allowlist. Stored in env so it's
 * configurable without redeploying code.
 *
 * Set ADMIN_EMAILS=foo@bar.com,baz@qux.com  in Vercel.
 */
const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

export async function currentUserIsAdmin(): Promise<boolean> {
  try {
    const { auth, currentUser } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return false;
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    return isAdminEmail(email);
  } catch {
    return false;
  }
}
