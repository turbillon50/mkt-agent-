import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { enterProject, type ProjectContext } from '@/lib/project-access';
import { landingSection, PROJECT_SECTION_LABEL, type ProjectSection } from '@/src/projects/types';

/**
 * La puerta que usa cada sección del proyecto.
 *
 * Resuelve el acceso, deja el proyecto activo y devuelve el contexto — o corta.
 * Se llama desde cada página y no desde el layout a propósito: el layout no
 * sabe en qué sección está parado quien pide, y el permiso es POR SECCIÓN.
 *
 * Un `conector` que llega a Leads no ve un 404 confuso: se le dice en una línea
 * qué puede abrir y se le da el botón.
 */
export async function guardProject(
  projectId: string,
  section: ProjectSection,
): Promise<{ ctx: ProjectContext } | { denied: React.ReactElement }> {
  const resolution = await enterProject(projectId, section);

  if (resolution.ok) return { ctx: resolution.ctx };

  if (resolution.problem === 'org') {
    if (resolution.orgProblem === 'unauthenticated') redirect('/sign-in');
    redirect('/onboarding');
  }

  // No existe, o existe y es de otra organización. Las dos cosas se ven igual
  // desde fuera a propósito: decir "no puedes" confirma que el proyecto existe.
  if (resolution.problem === 'no_existe') notFound();

  return { denied: <SinAcceso projectId={projectId} section={section} /> };
}

async function SinAcceso({
  projectId,
  section,
}: {
  projectId: string;
  section: ProjectSection;
}) {
  // Sin la sección se sabe si tiene ALGÚN rol en el proyecto: si lo tiene, se
  // le ofrece la sección que sí le toca en vez de un callejón sin salida.
  const base = await enterProject(projectId);
  const rol = base.ok ? base.ctx.projectRole : null;
  const destino = rol ? landingSection(rol) : null;
  const href = destino === 'inicio' ? `/projects/${projectId}` : `/projects/${projectId}/${destino}`;

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <h1 className="text-lg font-semibold">
            {PROJECT_SECTION_LABEL[section]} no es para tu rol
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {rol
              ? `En este proyecto eres ${rol}. Pídele al dueño que te cambie el rol si necesitas entrar aquí.`
              : 'No tienes acceso a este proyecto.'}
          </p>
          <div className="pt-1">
            <Button asChild className="btn-brand">
              <Link href={rol ? href : '/projects'}>
                {rol ? `Ir a ${PROJECT_SECTION_LABEL[destino!]}` : 'Ver mis proyectos'}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
