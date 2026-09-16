import Link from 'next/link';
import { IconArrowLeft, IconLogoMark } from '@/components/icons';
import { isClerkConfigured } from '@/lib/clerk-config';

export default async function Page() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white">
              <IconLogoMark className="h-4 w-4" />
            </div>
            <span className="text-xl font-semibold tracking-tight brand-gradient">goossip</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <IconArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-50">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--color-primary)]/12 blur-[120px]" />
        </div>

        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="hidden lg:block">
            <h1 className="text-balance text-3xl font-semibold leading-tight">
              Bienvenido a <span className="brand-gradient">Goossip</span>
            </h1>
            <p className="mt-3 text-balance text-[var(--color-muted-foreground)]">
              Tu vendedor que no duerme. Entra para volver a tus leads, a tu plan de contenido
              y a tus conversaciones de WhatsApp.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[var(--color-muted-foreground)]">
              <li>• Tu plan de la semana, armado solo</li>
              <li>• WhatsApp que contesta por ti, si tú quieres</li>
              <li>• Todos tus leads y sus conversaciones en un solo lugar</li>
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
      <div className="card-glow rounded-2xl p-8 text-center">
        <h2 className="text-lg font-semibold">Modo demo</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Aquí todavía no se puede iniciar sesión. Entra directo al panel de muestra.
        </p>
        <Link
          href="/dashboard"
          className="btn-brand mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium"
        >
          Entrar al panel
        </Link>
      </div>
    );
  }
  const { SignIn } = await import('@clerk/nextjs');
  return (
    <div className="space-y-4">
      <div className="min-h-[420px]">
        <SignIn
          forceRedirectUrl="/dashboard"
          fallbackRedirectUrl="/dashboard"
          signUpUrl="/sign-up"
          appearance={{
            variables: {
              colorPrimary: '#d6336c',
              colorBackground: '#ffffff',
              colorText: '#221821',
              colorTextSecondary: '#6b5b66',
              colorInputBackground: '#ffffff',
              colorInputText: '#221821',
              borderRadius: '0.875rem',
            },
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-xl border border-[var(--color-border)]',
            },
          }}
        />
      </div>
      {/*
        Salida de emergencia cuando el formulario de arriba no monta. No dice de
        quién es la pantalla: el nombre de nuestro proveedor de contraseñas no
        le resuelve nada a quien solo quiere entrar.
      */}
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        ¿No carga el formulario?{' '}
        <a
          href="https://accounts.vliving.life/sign-in"
          className="underline hover:text-[var(--color-foreground)]"
          rel="noreferrer"
        >
          Entra por aquí
        </a>
        .
      </p>
    </div>
  );
}
