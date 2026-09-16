import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { projectThreads } from '@/src/projects/conversations';

export const dynamic = 'force-dynamic';

const ESTADO: Record<string, string> = {
  open: 'Abierta',
  escalated: 'Te necesita',
  closed: 'Cerrada',
};

export default async function ConversacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'conversaciones');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId } = guard.ctx;

  const hilos = await projectThreads(orgId, id);

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Conversaciones"
        description="Los hilos abiertos con tu gente y quién habló al final."
      />

      {hilos.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Todavía no hay conversaciones. En cuanto alguien escriba, el hilo aparece aquí.
            </p>
            <Button asChild variant="outline">
              <Link href={`/projects/${id}/conexiones`}>Revisar mis canales</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {hilos.map((h) => (
                <li key={h.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-primary)]">
                    {h.lead?.grado ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {h.lead?.nombre ?? h.lead?.telefono ?? 'Sin nombre'}
                      </p>
                      {h.estado !== 'open' && (
                        <span className="shrink-0 rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px]">
                          {ESTADO[h.estado] ?? h.estado}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {h.ultimoEntrante ? '' : 'Tú: '}
                      {h.ultimoTexto ?? 'Sin mensajes'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground)]">
                    {h.ultimoAt
                      ? h.ultimoAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
