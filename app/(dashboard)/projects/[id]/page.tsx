import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconCheck } from '@/components/icons';
import { guardProject } from '@/components/projects/project-guard';
import { FranjaConexiones } from '@/components/projects/franja-conexiones';
import { AsistenteEmbebido } from '@/components/assistant/asistente-embebido';
import { projectHome } from '@/src/projects/home';
import { PROJECT_EVENT_LABEL, type ProjectEventType } from '@/src/projects/types';
import { PROJECT_KIND_LABEL } from '@/src/sales/types';

export const dynamic = 'force-dynamic';

/**
 * El Inicio del proyecto: el CENTRO DE MANDO (corrida 7).
 *
 * Lo que había era una lista de cinco pendientes y seis ceros. Luis lo dijo
 * así: *"en un nuevo proyecto no se ve todo lo que tenemos de conexiones y
 * demás; el chat y todas las herramientas deben ser visibles y funcionar"*.
 * Un panel que solo enseña lo que FALTA esconde lo que la app sabe hacer, y
 * quien entra el primer día se va creyendo que compró un tablero vacío.
 *
 * El orden de arriba abajo es el orden en que alguien decide qué hacer:
 *   1. dónde estoy y qué puedo lanzar ahora (cabecera con acciones),
 *   2. con qué cuento (la franja de conexiones, TODAS),
 *   3. a quién le pregunto (el Asistente, a la vista y no detrás de ⌘K),
 *   4. cómo voy (cuatro números que sí se miran),
 *   5. con qué herramientas (el grid, cada una con su estado),
 *   6. qué pasó (la bitácora).
 *
 * Los números son `count(*)`. Cero se muestra como cero.
 */
export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'inicio');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, can } = guard.ctx;

  const { numbers, connections, checklist, listos, herramientas, actividad, vendedor } =
    await projectHome(project);
  const base = `/projects/${project.id}`;
  const faltan = checklist.filter((s) => !s.done);

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- cabecera */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {PROJECT_KIND_LABEL[project.kind] ?? project.kind}
            {project.city ? ` · ${project.city}` : ''}
            {project.country ? `, ${project.country}` : ''}
            {' · Vendedor: '}
            {vendedor ? (
              <Link href={`${base}/ajustes`} className="hover:underline">
                {vendedor}
              </Link>
            ) : (
              <Link href={`${base}/ajustes`} className="text-[var(--color-primary)] hover:underline">
                sin definir
              </Link>
            )}
          </p>
        </div>

        {can('operar') && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="btn-brand">
              <Link href={`${base}/campanas`}>Nueva campaña</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/contenido`}>Publicar contenido</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/equipo`}>Invitar</Link>
            </Button>
          </div>
        )}
      </header>

      {/* ------------------------------------------------- franja de conexiones */}
      <FranjaConexiones
        projectId={project.id}
        cards={connections.cards}
        conectados={connections.conectados}
        total={connections.total}
        aviso={connections.reconciliado?.error ?? null}
      />

      {/*
        `lg:items-start` y no el estirado por omisión.

        Sin él, las dos columnas se igualan a la más alta y el Asistente —que es
        una caja de chat vacía en un proyecto nuevo— crecía hasta los 620 px con
        medio metro de blanco adentro. Se vio en la captura de 1440 y se veía
        exactamente como lo que es: una caja sin terminar.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <AsistenteEmbebido projectId={project.id} nombre={project.name} puedeOperar={can('operar')} />

        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <Numero
              label="Leads sin contactar"
              valor={numbers.sinContactar}
              href={`${base}/leads`}
              destacar={numbers.sinContactar > 0}
            />
            <Numero
              label="Conversaciones abiertas"
              valor={numbers.conversacionesAbiertas}
              href={`${base}/conversaciones`}
            />
            <Numero
              label="Acciones por aprobar"
              valor={numbers.accionesPendientes}
              href={`${base}/automatizaciones`}
              destacar={numbers.accionesPendientes > 0}
            />
            <Numero
              label="Posts programados"
              valor={numbers.postsProgramados}
              href={`${base}/contenido`}
            />
          </section>

          {/*
            La lista de arranque se queda, pero ENCOGIDA y solo con lo que
            falta: es útil el primer día y estorba el día treinta. Cuando está
            completa se dice en una línea y no ocupa media pantalla.
          */}
          <Card>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Para arrancar</h2>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {listos} de {checklist.length}
                </span>
              </div>
              {faltan.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  Este proyecto está completo. Tu vendedor ya puede trabajar solo.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {faltan.map((paso) => (
                    <li key={paso.id} className="flex items-center gap-2">
                      <span className="h-4 w-4 shrink-0 rounded-full border border-dashed border-[var(--color-border)]" />
                      <span className="min-w-0 flex-1 truncate text-xs" title={paso.help}>
                        {paso.label}
                      </span>
                      <Link
                        href={paso.href}
                        className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {paso.cta}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------- herramientas */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Herramientas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {herramientas.map((h) => (
            <Link key={h.id} href={h.href} className="group">
              <Card className="h-full transition-colors hover:border-[var(--color-primary)]/50">
                <CardContent className="space-y-1 py-4">
                  <p className="text-sm font-medium group-hover:text-[var(--color-primary)]">
                    {h.label}
                  </p>
                  <p className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                    {h.blurb}
                  </p>
                  <p
                    className={
                      h.conContenido
                        ? 'pt-0.5 text-[11px] font-medium'
                        : 'pt-0.5 text-[11px] font-medium text-[var(--color-primary)]'
                    }
                  >
                    {h.estado}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- actividad */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Actividad</h2>
        <Card>
          <CardContent className="p-0">
            {actividad.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                Todavía no ha pasado nada en este proyecto.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {actividad.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">
                      {e.createdAt.toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {PROJECT_EVENT_LABEL[e.type as ProjectEventType] ?? e.type}
                    </span>
                    <span className="shrink-0 truncate text-[var(--color-muted-foreground)]">
                      {e.actorEmail ?? e.actor}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
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
  href,
  destacar = false,
}: {
  label: string;
  valor: number;
  href: string;
  destacar?: boolean;
}) {
  return (
    <Link href={href}>
      <Card
        className={
          destacar
            ? 'h-full border-[var(--color-primary)]/40 transition-colors hover:border-[var(--color-primary)]'
            : 'h-full transition-colors hover:border-[var(--color-primary)]/40'
        }
      >
        <CardContent className="py-4">
          <p className="text-2xl font-semibold tabular-nums">{valor}</p>
          <p className="text-[11px] leading-tight text-[var(--color-muted-foreground)]">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
