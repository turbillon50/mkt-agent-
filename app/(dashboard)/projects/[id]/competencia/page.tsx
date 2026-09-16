import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { TableroCompetencia } from '@/components/competencia/tablero';

export const dynamic = 'force-dynamic';

/**
 * Competencia, DENTRO del proyecto (corrida 7).
 *
 * Lo que se lee de verdad y lo que no está medido y dicho en la pantalla, no
 * escondido: de tu propia página se lee por la API con tu conexión, y de la
 * página de un rival Meta no deja leer sin revisión de app — así que se lee su
 * web pública y se anota con qué código contestó cada fuente.
 */
export default async function CompetenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'competencia');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Competencia"
        description="Qué publican tus rivales y cada cuánto, contra lo que publicas tú. Cada número dice de dónde salió."
      />
      <TableroCompetencia projectId={id} />
    </div>
  );
}
