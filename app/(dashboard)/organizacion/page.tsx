import { OrgProfile } from '@/components/orgs/org-profile';
import { orgContextOrNull } from '@/lib/org';

export const dynamic = 'force-dynamic';

/**
 * Miembros e invitaciones. Se monta el `OrganizationProfile` de Clerk tal cual:
 * invitar, cambiar rol y sacar gente son operaciones de Clerk, no nuestras.
 * Duplicarlas aquí sería inventar una segunda fuente de verdad.
 */
export default async function Page() {
  const ctx = await orgContextOrNull();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{ctx?.org.name ?? 'Organización'}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Miembros, invitaciones y roles.{' '}
          {ctx ? (
            <>
              Tú entras como <strong>{etiquetaRol(ctx.role)}</strong>
              {ctx.role === 'org:member' && ' — operas leads, no tocas canales ni facturación.'}
            </>
          ) : null}
        </p>
      </header>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 card-glow">
        <OrgProfile />
      </div>
    </div>
  );
}

function etiquetaRol(role: string): string {
  if (role === 'org:owner') return 'dueño';
  if (role === 'org:admin') return 'administrador';
  return 'miembro';
}
