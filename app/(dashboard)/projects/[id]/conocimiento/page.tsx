import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { KnowledgeForm } from '@/components/projects/knowledge-form';
import { KnowledgeImport } from '@/components/projects/knowledge-import';
import { listKnowledge } from '@/lib/data';
import { formatDate } from '@/lib/utils';
import { listProjectAccounts } from '@/src/projects/connections';

export const dynamic = 'force-dynamic';

/**
 * Lo que tu vendedor sabe del negocio. Es de donde saca las respuestas cuando
 * no hay catálogo conectado: si no está aquí, no lo dice.
 */
export default async function ConocimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'conocimiento');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId } = guard.ctx;

  const [rows, cuentas] = await Promise.all([
    listKnowledge(orgId).catch(() => []),
    listProjectAccounts(orgId, id).catch(() => []),
  ]);
  // De dónde se puede traer hoy: lo que este proyecto tenga conectado de verdad.
  const conectadas = cuentas.filter((c) => c.status === 'connected').map((c) => c.platform);

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Conocimiento"
        description="Lo que tu vendedor sabe del negocio y puede contestar sin inventar."
      />

      {guard.ctx.can('operar') && (
        <>
          <KnowledgeImport projectId={id} conectadas={conectadas} />
          <KnowledgeForm projectId={id} />
        </>
      )}

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              Todavía no le has enseñado nada. Pega tus preguntas frecuentes, tus precios o tu
              forma de trabajar.
            </CardContent>
          </Card>
        ) : (
          rows.map((k) => (
            <Card key={k.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{k.title ?? 'Sin título'}</CardTitle>
                  <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(k.createdAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-6 whitespace-pre-wrap text-sm">{k.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
