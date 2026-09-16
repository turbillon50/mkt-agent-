import { AppShell } from '@/components/app-shell';
import { currentUserOrNull } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // El nivel agencia solo aparece si el tenant es admin. La ruta además se
  // protege del lado del servidor en /api/agency: esconder el link no basta.
  const user = await currentUserOrNull();
  return <AppShell isAdmin={user?.isAdmin ?? false}>{children}</AppShell>;
}
