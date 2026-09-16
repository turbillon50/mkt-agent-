import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { listPosts } from '@/lib/data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ContenidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'contenido');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId } = guard.ctx;

  const posts = await listPosts(orgId).catch(() => []);

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Contenido"
        description="Lo que se ha publicado en tus redes, de lo más nuevo a lo más viejo."
      />

      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
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
    </div>
  );
}
