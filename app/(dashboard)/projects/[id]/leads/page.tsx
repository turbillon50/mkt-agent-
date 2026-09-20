import Link from 'next/link';
import { SalesPipeline } from '@/components/sales/pipeline';
import { TableroProspeccion } from '@/components/prospeccion/tablero';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { whatsappHabilitado } from '@/src/banderas';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Leads del proyecto, en dos pestañas:
 *
 *   · **Pipeline** — la gente que ya levantó la mano. El tablero de la corrida 1.
 *   · **Prospección** — los negocios a los que salimos a buscar nosotros, por
 *     Google Maps (corrida 7).
 *
 * Están juntos y no en dos secciones porque son el mismo embudo visto desde los
 * dos extremos, y porque el botón que importa —"convertir a lead"— cruza de una
 * a la otra.
 *
 * La pestaña vive en la URL (`?vista=`) y no en un `useState`: así el enlace de
 * Prospección desde el Inicio y el desvío de `/prospectos` caen donde deben, y
 * recargar no te devuelve a la otra pestaña.
 */
export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const { id } = await params;
  const { vista } = await searchParams;
  const guard = await guardProject(id, 'leads');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const enProspeccion = vista === 'prospeccion';

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Leads"
        description="Toda la gente que levantó la mano, y los negocios a los que vamos a buscar nosotros."
      />

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        <Pestana href={`/projects/${id}/leads`} activo={!enProspeccion}>
          Pipeline
        </Pestana>
        <Pestana href={`/projects/${id}/leads?vista=prospeccion`} activo={enProspeccion}>
          Prospección
        </Pestana>
      </nav>

      {enProspeccion ? (
        <div className="space-y-4">
          {/*
            El puente a la Sala en vivo (corrida 12). Va ARRIBA de la lista y no
            escondido en un menú porque es lo que alguien quiere abrir cuando
            tiene al prospecto enfrente, y buscarlo en ese momento es perderlo.
          */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Míralo recorrer la zona</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                El mapa en grande, cuadrante por cuadrante, con los negocios cayendo en vivo. Trae
                modo Presentación para enseñárselo a un cliente.
              </p>
            </div>
            <Link
              href={`/projects/${id}/prospeccion`}
              className="btn-brand inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm"
            >
              Abrir la Sala en vivo
            </Link>
          </div>
          <TableroProspeccion projectId={id} />
        </div>
      ) : (
        /*
          `whatsapp` viene del SERVIDOR: el tablero es un componente de cliente y
          las banderas del entorno no cruzan sin `NEXT_PUBLIC_`. Con la bandera
          abajo —que es como está por decisión de Luis— la caja de plantillas de
          WhatsApp no se monta.
        */
        <SalesPipeline whatsapp={whatsappHabilitado()} />
      )}
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
