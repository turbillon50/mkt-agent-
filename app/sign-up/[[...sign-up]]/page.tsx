import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { isClerkConfigured } from '@/lib/clerk-config';

const perks = [
  'Plan semanal automático',
  'Voz de marca con memoria',
  'X + LinkedIn + WhatsApp',
  'Tu DB Neon · sin lock-in',
  'Cron 24/7 en Vercel',
];

export default async function Page() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-500 text-sm font-bold">
              oo
            </div>
            <span className="text-xl font-semibold tracking-tight brand-gradient">goossip</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-[120px]" />
        </div>

        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="hidden lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1 text-xs text-fuchsia-200">
              Early access · gratis
            </span>
            <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight">
              Empieza a operar tus redes <span className="brand-gradient">en automático</span>
            </h1>
            <p className="mt-3 text-balance text-[var(--color-muted-foreground)]">
              Crea tu cuenta y en 10 minutos Goossip está planeando, redactando y publicando por ti.
              Sin tarjeta. Sin lock-in.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {perks.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-fuchsia-400" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-md">
            {await renderForm()}
          </div>
        </div>
      </main>
    </div>
  );
}

async function renderForm() {
  if (!isClerkConfigured()) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-8 text-center">
        <h2 className="text-lg font-semibold">Modo demo</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Clerk no está configurado. Entra directo al dashboard de muestra.
        </p>
        <Link
          href="/dashboard"
          className="btn-brand mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium"
        >
          Entrar al dashboard
        </Link>
      </div>
    );
  }
  const { SignUp } = await import('@clerk/nextjs');
  return (
    <SignUp
      appearance={{
        elements: {
          rootBox: 'mx-auto',
          card: 'shadow-2xl shadow-fuchsia-500/10',
        },
      }}
    />
  );
}
