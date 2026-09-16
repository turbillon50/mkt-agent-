import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconPlus, IconPlug, IconUsers } from '@/components/icons';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';
import { connectedCounts } from '@/src/projects/connections';
import { memberCounts } from '@/src/projects/members';
import { PROJECT_ROLE_LABEL } from '@/src/projects/types';
import { PROJECT_KIND_LABEL } from '@/src/sales/types';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');

  const visible = await visibleProjects(ctx);
  // Sin un solo proyecto no hay lista que enseñar: se va directo al alta.
  if (visible.length === 0) redirect('/projects/new');

  const ids = visible.map((v) => v.project.id);
  const [canales, miembros] = await Promise.all([connectedCounts(ids), memberCounts(ids)]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Cada proyecto es un negocio con su vendedor, sus canales, su gente y sus leads.
          </p>
        </div>
        <Button asChild className="btn-brand">
          <Link href="/projects/new">
            <IconPlus className="h-4 w-4" /> Nuevo proyecto
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(({ project, role }) => (
          <Link key={project.id} href={`/projects/${project.id}`} className="block">
            <Card className="h-full transition-colors hover:border-[var(--color-primary)]/40 card-glow">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{project.name}</h2>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {PROJECT_KIND_LABEL[project.kind] ?? project.kind}
                      {project.city ? ` · ${project.city}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                    {PROJECT_ROLE_LABEL[role]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/60 px-2 py-1">
                    <IconPlug className="h-3 w-3" />
                    {canales.get(project.id) ?? 0} canales conectados
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/60 px-2 py-1">
                    <IconUsers className="h-3 w-3" />
                    {miembros.get(project.id) ?? 0} en el equipo
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
