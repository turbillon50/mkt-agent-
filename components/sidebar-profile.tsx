'use client';

import * as React from 'react';
import { UserButton, useUser, useOrganization, useOrganizationList } from '@clerk/nextjs';
import { IconChevronDown, IconCheck, IconUsers } from '@/components/icons';
import { cn } from '@/lib/utils';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfigured =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/**
 * Selector de workspace ligado a Clerk Organizations.
 * Cada cliente de Goossip = una organización de Clerk. Hoy el modelo de datos
 * sigue siendo single-tenant por usuario (no hay workspace_id en leads/campaigns),
 * así que esto es solo el cambio de contexto activo en Clerk; la migración de
 * schema se propone aparte (ver Brain). Si las orgs no están habilitadas en la
 * instancia, degrada con elegancia a "Espacio personal" sin romperse.
 */
function WorkspaceSwitcher() {
  const { organization } = useOrganization();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const memberships = userMemberships?.data ?? [];
  const currentName = organization?.name ?? 'Espacio personal';
  const currentInitial = currentName.charAt(0).toUpperCase();

  async function pick(orgId: string | null) {
    if (!setActive) return;
    try {
      await setActive({ organization: orgId });
    } catch {
      /* orgs no habilitadas todavía — no-op */
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/70 px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-accent)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-[11px] font-bold text-white">
            {currentInitial}
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              Workspace
            </span>
            <span className="mt-0.5 truncate text-xs font-medium text-[var(--color-foreground)]">
              {currentName}
            </span>
          </span>
        </span>
        <IconChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-accent)]/60',
              !organization && 'bg-[var(--color-accent)]',
            )}
          >
            <span className="truncate">Espacio personal</span>
            {!organization && <IconCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />}
          </button>

          {memberships.map((m) => (
            <button
              key={m.organization.id}
              type="button"
              onClick={() => pick(m.organization.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-accent)]/60',
                organization?.id === m.organization.id && 'bg-[var(--color-accent)]',
              )}
            >
              <span className="truncate">{m.organization.name}</span>
              {organization?.id === m.organization.id && (
                <IconCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
              )}
            </button>
          ))}

          {isLoaded && memberships.length === 0 && (
            <p className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
              <IconUsers className="h-3.5 w-3.5 shrink-0" />
              Los espacios por cliente se habilitan pronto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ClerkProfileCard() {
  const { user, isLoaded } = useUser();

  const name = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Mi cuenta';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div className="flex flex-col gap-2">
      <WorkspaceSwitcher />
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 px-2.5 py-2">
        <div className="shrink-0">
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-9 w-9' } }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">
            {isLoaded ? name : 'Cargando…'}
          </span>
          {email && (
            <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">{email}</span>
          )}
        </div>
        <span className="shrink-0 rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
          Pro
        </span>
      </div>
    </div>
  );
}

function FallbackProfileCard() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 px-2.5 py-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-sm font-bold text-white">
        G
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">Goossip</span>
        <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">Espacio personal</span>
      </div>
      <span className="shrink-0 rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
        Pro
      </span>
    </div>
  );
}

export function SidebarProfile() {
  return isClerkConfigured ? <ClerkProfileCard /> : <FallbackProfileCard />;
}
