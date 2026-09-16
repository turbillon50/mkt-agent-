import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { GaleriaPiezas } from '@/components/marca/galeria-piezas';
import { VistaSemana } from '@/components/contenido/semana';
import { getBrandKit, kitCompleto } from '@/src/creative/brand-kit';
import { listPosts } from '@/lib/data';
import { formatDate, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Contenido: las PIEZAS, la SEMANA y lo publicado.
 *
 * La pestaña "Semana" sustituye al Calendario global (corrida 7). Un calendario
 * que mezclaba el contenido de tres clientes no servía para planear el de
 * ninguno; lo que se quiere ver es "qué sale esta semana de ESTE cliente, en
 * qué red y con qué estado de aprobación".
 *
 * Las piezas van arriba a propósito: la pantalla se abre para hacer la de hoy,
 * no para releer lo del mes pasado. Lo publicado sigue estando, debajo, que es
 * donde se va a buscar cuando se busca.
 */
export default async function ContenidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const { id } = await params;
  const { vista } = await searchParams;
  const guard = await guardProject(id, 'contenido');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId, can } = guard.ctx;

  const [posts, kit] = await Promise.all([
    listPosts(orgId, undefined, id).catch(() => []),
    getBrandKit(orgId, id).catch(() => null),
  ]);

  const enSemana = vista === 'semana';

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Contenido"
        description="Tus piezas, cómo se ven en cada red antes de publicarlas, y qué sale esta semana."
      />

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        <Pestana href={`/projects/${id}/contenido`} activo={!enSemana}>
          Piezas
        </Pestana>
        <Pestana href={`/projects/${id}/contenido?vista=semana`} activo={enSemana}>
          Semana
        </Pestana>
      </nav>

      {enSemana ? (
        <VistaSemana projectId={id} />
      ) : (
        <GaleriaPiezas
          projectId={id}
          puedeEditar={can('operar')}
          kitCompleto={kitCompleto(kit)}
          nombreProyecto={project.name}
          logo={kit?.logoUrl ?? null}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">Ya publicado</h2>
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

function Pestana({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
        activo
          ? 'border-[var(--color-primary)] font-medium text-[var(--color-primary)]'
          : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
      )}
    >
      {children}
    </Link>
  );
}
