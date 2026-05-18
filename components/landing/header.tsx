import Link from 'next/link';

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-500 text-sm font-bold">
            oo
          </div>
          <span className="text-xl font-semibold tracking-tight brand-gradient">goossip</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-[var(--color-muted-foreground)] md:flex">
          <a href="#features" className="hover:text-[var(--color-foreground)]">Funciones</a>
          <a href="#how" className="hover:text-[var(--color-foreground)]">Cómo funciona</a>
          <a href="#pricing" className="hover:text-[var(--color-foreground)]">Precio</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent)] sm:inline-block"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="btn-brand rounded-md px-4 py-1.5 text-sm font-medium shadow-lg shadow-fuchsia-500/20"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  );
}
