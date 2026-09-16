import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconCheck } from '@/components/icons';
import { guardProject } from '@/components/projects/project-guard';
import { projectHome } from '@/src/projects/home';
import { PROJECT_KIND_LABEL } from '@/src/sales/types';

export const dynamic = 'force-dynamic';

/**
 * Inicio del proyecto: qué falta para arrancar y cómo va.
 *
 * Los números son `count(*)` de este proyecto, no promedios ni estimaciones.
 * Cero se muestra como cero — un panel que enseña "12 leads" cuando no hay
 * ninguno solo sirve para que nadie vuelva a creerle al panel.
 */
export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'inicio');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const { numbers, checklist, listos } = await projectHome(project);
  const completo = listos === checklist.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {PROJECT_KIND_LABEL[project.kind] ?? project.kind}
          {project.city ? ` · ${project.city}` : ''}
          {project.country ? `, ${project.country}` : ''}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Numero label="Leads hoy" valor={numbers.leadsHoy} />
        <Numero label="Leads esta semana" valor={numbers.leadsSemana} />
        <Numero label="Sin contactar" valor={numbers.sinContactar} destacar={numbers.sinContactar > 0} />
        <Numero label="Conversaciones abiertas" valor={numbers.conversacionesAbiertas} />
        <Numero
          label="Acciones pendientes"
          valor={numbers.accionesPendientes}
          destacar={numbers.accionesPendientes > 0}
        />
        <Numero label="Leads en total" valor={numbers.leadsTotal} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Para arrancar</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {listos} de {checklist.length}
          </span>
        </div>

        {completo ? (
          <Card className="card-glow">
            <CardContent className="flex items-center gap-3 py-6">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]">
                <IconCheck className="h-4 w-4" />
              </span>
              <p className="text-sm">
                Este proyecto está completo. Tu vendedor ya puede trabajar solo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {checklist.map((paso) => (
                  <li key={paso.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span
                      className={
                        paso.done
                          ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]'
                          : 'h-7 w-7 shrink-0 rounded-full border border-dashed border-[var(--color-border)]'
                      }
                    >
                      {paso.done && <IconCheck className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={paso.done ? 'text-sm text-[var(--color-muted-foreground)] line-through' : 'text-sm font-medium'}>
                        {paso.label}
                      </p>
                      {!paso.done && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">{paso.help}</p>
                      )}
                    </div>
                    {!paso.done && (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={paso.href}>{paso.cta}</Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {projectRole === 'lector' && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          En este proyecto miras sin cambiar nada.
        </p>
      )}
    </div>
  );
}

function Numero({
  label,
  valor,
  destacar = false,
}: {
  label: string;
  valor: number;
  destacar?: boolean;
}) {
  return (
    <Card className={destacar ? 'border-[var(--color-primary)]/40' : ''}>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        <p className="text-[11px] leading-tight text-[var(--color-muted-foreground)]">{label}</p>
      </CardContent>
    </Card>
  );
}
