import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { GaleriaPiezas } from '@/components/marca/galeria-piezas';
import { VistaSemana } from '@/components/contenido/semana';
import { Sala } from '@/components/contenido/sala';
import { getBrandKit, kitCompleto } from '@/src/creative/brand-kit';
import { listPosts } from '@/lib/data';
import { formatDate, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * La SALA DE ARTE Y COMUNICACIÓN (antes "Contenido").
 *
 * El nombre cambió porque cambió lo que se hace aquí. "Contenido" era una
 * galería: se miraban las piezas. Esto es una sala de revisión: se mira la
 * pieza EN LA RED, se comprueba que la red la va a aceptar, y se decide.
 *
 * La ruta se queda en `/contenido` a propósito: hay enlaces vivos en el Inicio,
 * en la guía del Asistente y en los correos que ya salieron. Renombrar la ruta
 * habría roto todos por un nombre más bonito en la barra de direcciones.
 *
 * Tres pestañas, en el orden en que se usan:
 *
 *   Sala    — el visor fiel por red, la compuerta anti-baneo y la guía de cómo
 *             se postea en cada una. Es la que abre por omisión: quien entra
 *             aquí viene a revisar algo, no a hacer inventario.
 *   Piezas  — la galería y el botón de generar. Es de donde salen.
 *   Semana  — qué sale esta semana, por día y por red.
 *
 * Lo publicado sigue estando, debajo, que es donde se va a buscar cuando se
 * busca.
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
  const enPiezas = vista === 'piezas';
  const enSala = !enSemana && !enPiezas;

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Sala de arte y comunicación"
        description="Cómo se va a ver tu pieza en cada red, si la red la va a aceptar, y cómo se postea ahí sin que te cierren la cuenta."
      />

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        <Pestana href={`/projects/${id}/contenido`} activo={enSala}>
          Sala
        </Pestana>
        <Pestana href={`/projects/${id}/contenido?vista=piezas`} activo={enPiezas}>
          Piezas
        </Pestana>
        <Pestana href={`/projects/${id}/contenido?vista=semana`} activo={enSemana}>
          Semana
        </Pestana>
      </nav>

      {enSemana ? (
        <VistaSemana projectId={id} />
      ) : enPiezas ? (
        <GaleriaPiezas
          projectId={id}
          puedeEditar={can('operar')}
          kitCompleto={kitCompleto(kit)}
          nombreProyecto={project.name}
          logo={kit?.logoUrl ?? null}
        />
      ) : (
        <Sala
          projectId={id}
          puedeEditar={can('operar')}
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
