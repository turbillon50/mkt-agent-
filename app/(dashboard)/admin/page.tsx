import { redirect } from 'next/navigation';
import { AdminConsole } from '@/components/admin/admin-console';
import { isClerkConfigured } from '@/lib/clerk-config';
import { currentUserOrNull } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * Módulo de administración de la aplicación. Absorbe al /agency de la corrida 1.
 *
 * Doble candado: aquí (para que ni se renderice) y en cada `/api/admin/*` con
 * `apiAppAdmin`. Esconder el link nunca fue protección.
 */
export default async function Page() {
  if (isClerkConfigured()) {
    const user = await currentUserOrNull();
    if (!user) redirect('/sign-in');
    if (!user.isAdmin) redirect('/dashboard');
  }
  return <AdminConsole />;
}
