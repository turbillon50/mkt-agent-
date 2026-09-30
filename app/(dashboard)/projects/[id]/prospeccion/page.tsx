import { SalaProspeccion, type ArranqueSala } from '@/components/prospeccion/sala';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { objetivosDe } from '@/src/prospeccion/objetivos';

export const dynamic = 'force-dynamic';

/**
 * La Sala de Prospección tiene su propia ruta y no es una pestaña más.
 *
 * Dos razones, y ninguna es estética. La primera: el mapa quiere la pantalla
 * completa, y una pestaña dentro de Leads lo deja en una caja de 400 px de alto
 * con la lista compitiéndole el espacio. La segunda, la que pesa: esto se abre
 * **delante de un prospecto**. Una URL que se pueda mandar —o pegar en la barra
 * antes de una junta— vale más que un clic menos.
 *
 * La lista completa, con el CSV y el histórico, se queda donde estaba
 * (`/leads?vista=prospeccion`). Son dos preguntas distintas: aquí es *míralo
 * trabajar*, allá es *qué tengo acumulado*.
 *
 * Los parámetros de la URL son el puente con el Asistente: cuando alguien le
 * dice "busca restaurantes sin sitio web en Tulum", la herramienta devuelve un
 * enlace a esta ruta con `auto=1` y la Sala arranca sola.
 */
export default async function ProspeccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    zona?: string;
    objetivo?: string;
    giros?: string;
    sinSitio?: string;
    radio?: string;
    demo?: string;
    auto?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const guard = await guardProject(id, 'leads');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const objetivos = objetivosDe(project.kind);
  const arranque: ArranqueSala = {
    zona: sp.zona?.slice(0, 120),
    // El objetivo solo se acepta si existe en el catálogo de ESTE tipo de
    // proyecto: un `?objetivo=` inventado en la barra no debe dejar la pantalla
    // sin nada marcado y sin decir por qué.
    objetivo: objetivos.some((o) => o.id === sp.objetivo) ? sp.objetivo : undefined,
    giros: sp.giros
      ? sp.giros
          .split(',')
          .map((g) => g.trim())
          .filter((g) => g.length >= 3)
          .slice(0, 6)
      : undefined,
    sinSitio: sp.sinSitio === '1',
    radioM: sp.radio ? Math.min(Math.max(Number(sp.radio) || 3000, 500), 15_000) : undefined,
    demo: sp.demo === '1',
    auto: sp.auto === '1',
  };

  return (
    <div className="space-y-4">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Prospección en vivo"
        description="Goossip recorre la zona en el mapa y los negocios van cayendo. Todo lo que ves es real: cada punto es un negocio que Google acaba de devolver."
      />
      <SalaProspeccion
        projectId={id}
        projectKind={project.kind}
        projectName={project.name}
        arranque={arranque}
      />
    </div>
  );
}
