'use client';

import { OrganizationSwitcher } from '@clerk/nextjs';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/**
 * Selector de organización. Es la pieza que hace visible el multitenant: el
 * usuario ve en qué tenant está parado y se cambia sin salirse de la app.
 *
 * `afterSelectOrganizationUrl` va a /dashboard a propósito: al cambiar de org
 * cambia TODO lo que se está viendo (proyectos, leads, cola). Quedarse en un
 * detalle de lead de la org anterior daría un 404 y se vería como una falla.
 */
export function OrgSwitcher({ compact = false }: { compact?: boolean }) {
  if (!isClerkConfiguredClient) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        Clerk sin configurar
      </div>
    );
  }

  return (
    <div className="org-switcher" data-compact={compact ? 'si' : 'no'}>
      <OrganizationSwitcher
        hidePersonal
        afterCreateOrganizationUrl="/onboarding"
        afterSelectOrganizationUrl="/dashboard"
        afterLeaveOrganizationUrl="/onboarding"
        appearance={{
          elements: {
            rootBox: 'w-full',
            organizationSwitcherTrigger:
              'w-full justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm hover:bg-[var(--color-accent)]/60',
          },
        }}
      />
    </div>
  );
}
