import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { GaleriaPiezas } from '@/components/marca/galeria-piezas';
import { getBrandKit, kitCompleto } from '@/src/creative/brand-kit';
import { listPosts } from '@/lib/data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Contenido = las PIEZAS arriba y lo PUBLICADO abajo.
 *
 * En ese orden a propósito: la pantalla se abre para hacer la pieza de hoy,
 * no para releer lo del mes pasado. Lo publicado sigue estando, debajo, que es
 * donde se va a buscar cuando se busca.
 */
export default async function ContenidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'contenido');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId, can } = guard.ctx;

  const [posts, kit] = await Promise.all([
    listPosts(orgId, undefined, id).catch(() => []),
    getBrandKit(orgId, id).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Contenido"
        description="Tus piezas y lo que ya salió publicado."
      />

      <GaleriaPiezas projectId={id} puedeEditar={can('operar')} kitCompleto={kitCompleto(kit)} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">
          Ya publicado
        </h2>
        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Todavía no se ha publicado nada. Cuando salga la primera publicación, aparece aquí.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary">{p.platform}</Badge>
                      {p.topic && <span className="truncate text-sm">{p.topic}</span>}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                      {formatDate(p.publishedAt ?? p.createdAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{p.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
