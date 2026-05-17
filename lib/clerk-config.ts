export function isClerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const sk = process.env.CLERK_SECRET_KEY ?? '';
  if (!pk || !sk) return false;
  if (pk.includes('REPLACE_ME') || sk.includes('REPLACE_ME')) return false;
  if (!/^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(pk)) return false;
  if (!/^sk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(sk)) return false;
  return true;
}
