import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { PantallaEstrategia } from '@/components/motor/estrategia';
import { armarPantalla, auditarPantalla } from '@/src/motor/pantalla';
import { fichaDe } from '@/src/motor/ficha';
import { senalesVigentes, ultimaCorrida } from '@/src/motor/radar';
import { publicosDe } from '@/src/motor/publicos';
import { hipotesisSugerida, planDe } from '@/src/motor/plan';

export const dynamic = 'force-dynamic';

/**
 * Estrategia — el motor de análisis, dentro del proyecto (corrida 14).
 *
 * Esta pantalla solo LEE. Medir necesita navegador y eso corre en el servidor
 * (`motor/radar/`), no en Vercel; armar la ficha y los públicos llama al modelo y
 * se dispara aparte. Aquí se enseña lo último que se supo, con su fecha.
 *
 * El `auditarPantalla` de abajo no es decorativo: si el motor armó una cifra sin
 * fuente, se anota en el servidor con el defecto exacto. La pantalla NO se cae por
 * eso —dejar al cliente sin su estrategia por un número mal formado sería peor que
 * el número— pero el defecto no pasa callado, y la prueba `test:motor` lo convierte
 * en un fallo de build.
 */
export default async function EstrategiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'estrategia');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const [ficha, senales, corrida, publicos, plan] = await Promise.all([
    fichaDe(project.orgId, project.id),
    senalesVigentes(project.orgId, project.id),
    ultimaCorrida(project.orgId, project.id),
    publicosDe(project.orgId, project.id),
    planDe(project.orgId, project.id),
  ]);

  const e = armarPantalla({
    proyecto: project,
    ficha,
    senales,
    corrida,
    publicos,
    plan,
    hipotesisDe: hipotesisSugerida,
  });

  const defectos = auditarPantalla(e);
  if (defectos.length) {
    console.error(
      `[estrategia] ${defectos.length} número(s) sin procedencia en el proyecto ${project.id}:`,
      defectos.map((d) => `[${d.clase}] ${d.donde}: ${d.detalle}`).join(' | '),
    );
  }

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Estrategia"
        description="Qué vende este negocio, qué dice el mercado medido, a quién le hablamos y qué vamos a publicar. Cada número trae de dónde salió."
      />
      <PantallaEstrategia e={e} />
    </div>
  );
}
