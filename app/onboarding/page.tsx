import { redirect } from 'next/navigation';
import { IconLogoMark } from '@/components/icons';
import { isClerkConfigured } from '@/lib/clerk-config';
import { getOrCreateUser } from '@/lib/users';
import { listCampaigns } from '@/lib/campaigns';
import { CreateCampaignForm } from '@/components/campaigns/create-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!isClerkConfigured()) {
    redirect('/dashboard');
  }

  let user = null;
  let dbError: string | null = null;
  try {
    user = await getOrCreateUser();
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'unknown';
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12 text-center">
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          {dbError
            ? `No pudimos preparar tu cuenta: ${dbError}`
            : 'Necesitas iniciar sesión para continuar.'}
        </p>
      </div>
    );
  }

  const campaigns = await listCampaigns(user.id).catch(() => []);
  if (campaigns.length > 0) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12">
      <div className="w-full max-w-lg space-y-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/25">
          <IconLogoMark className="h-7 w-7" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">
            ¡Bienvenido, {user.firstName ?? 'a Goossip'}!
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Cada campaña es una marca distinta: su propia voz, audiencia e idioma. Crea la
            primera — luego le subes el manifiesto completo, conectas redes y Goossip empieza
            a planear sola cada lunes.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left card-glow">
          <CreateCampaignForm />
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)]">
          ¿Prefieres explorar primero?{' '}
          <a href="/dashboard" className="text-[var(--color-primary)] hover:underline">
            Ir al dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
