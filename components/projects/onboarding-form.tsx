'use client';

import { useRouter } from 'next/navigation';
import { ProjectForm } from './project-form';

/** El mismo formulario de /projects, en modo corto, y al guardar entra al panel. */
export function OnboardingForm() {
  const router = useRouter();
  return (
    <ProjectForm
      compact
      onSaved={() => {
        router.push('/dashboard');
      }}
    />
  );
}
