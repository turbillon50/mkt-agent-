import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-[var(--color-muted-foreground)] sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] text-[10px] font-bold text-[#04130d]">
            G
          </div>
          <span>Goossip · {new Date().getFullYear()}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/sign-in" className="hover:text-[var(--color-foreground)]">Entrar</Link>
          <Link href="/sign-up" className="hover:text-[var(--color-foreground)]">Crear cuenta</Link>
          <a href="#features" className="hover:text-[var(--color-foreground)]">Funciones</a>
          <a href="#pricing" className="hover:text-[var(--color-foreground)]">Precio</a>
          <a
            href="https://wa.me/529984292748"
            className="hover:text-[var(--color-primary)]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contacto
          </a>
        </div>
      </div>
    </footer>
  );
}
