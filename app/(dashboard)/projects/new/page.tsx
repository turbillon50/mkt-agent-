import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { canManageOrg } from '@/src/orgs/types';
import { NewProjectWizard } from '@/components/projects/new-project-wizard';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  // Dar de alta un proyecto es de quien manda en la organización. A un invitado
  // se le manda a lo suyo en vez de enseñarle un formulario que va a rebotar.
  if (!canManageOrg(ctx.role)) redirect('/projects');

  return (
    <Suspense>
      <NewProjectWizard />
    </Suspense>
  );
}
