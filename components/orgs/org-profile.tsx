'use client';

import { OrganizationProfile } from '@clerk/nextjs';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/** Miembros e invitaciones, con la UI de Clerk. */
export function OrgProfile() {
  if (!isClerkConfiguredClient) {
    return (
      <p className="p-4 text-sm text-[var(--color-muted-foreground)]">
        Clerk no está configurado en este entorno.
      </p>
    );
  }
  return (
    <OrganizationProfile
      routing="hash"
      appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full shadow-none' } }}
    />
  );
}
