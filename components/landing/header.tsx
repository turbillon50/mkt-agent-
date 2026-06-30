import Link from 'next/link';
import { IconLogoMark } from '@/components/icons';

export function LandingHeader() {
  return (
    <header className="glass sticky top-0 z-50 border-b border-[var(--color-border)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] text-[var(--color-primary-foreground)] shadow-lg shadow-[var(--color-primary)]/25">
            <IconLogoMark className="relative z-10 h-5 w-5" />
            <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <span className="text-[1.4rem] font-semibold leading-none tracking-tight brand-gradient">goossip</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-[var(--color-foreground-muted)] md:flex">
          <a href="#features" className="transition-colors hover:text-[var(--color-foreground)]">Funciones</a>
          <a href="#how" className="transition-colors hover:text-[var(--color-foreground)]">Cómo funciona</a>
          <a href="#pricing" className="transition-colors hover:text-[var(--color-foreground)]">Precio</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-card)]/40 px-3.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-accent)] sm:inline-block"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="btn-brand rounded-lg px-4 py-1.5 text-sm font-semibold"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  );
}
