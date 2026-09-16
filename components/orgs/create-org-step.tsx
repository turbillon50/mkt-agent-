'use client';

import { CreateOrganization } from '@clerk/nextjs';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/**
 * Paso 1 del onboarding: crear la ORGANIZACIÓN.
 *
 * Se usa el componente de Clerk y no un formulario propio a propósito: Clerk es
 * la fuente de verdad de orgs y membresías. Al terminar, Clerk deja la org como
 * activa en la sesión y regresa a /onboarding, que ya detecta que hay org y
 * pide el primer proyecto.
 */
export function CreateOrgStep() {
  if (!isClerkConfiguredClient) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Clerk no está configurado en este entorno.
      </p>
    );
  }
  return (
    <CreateOrganization
      skipInvitationScreen
      afterCreateOrganizationUrl="/onboarding"
      appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full shadow-none' } }}
    />
  );
}
