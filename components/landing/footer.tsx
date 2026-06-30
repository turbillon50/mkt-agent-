import Link from 'next/link';
import { IconLogoMark, IconWhatsApp, IconX } from '@/components/icons';

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] text-[var(--color-primary-foreground)]">
                <IconLogoMark className="h-4 w-4" />
              </div>
              <span className="text-xl font-semibold tracking-tight brand-gradient">goossip</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              La herramienta para influencers y vendedores LATAM que quieren crecer y monetizar
              sin perder el día en redes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:gap-14">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Producto
              </div>
              <ul className="mt-3 space-y-2">
                <li><a href="#features" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Funciones</a></li>
                <li><a href="#pricing" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Precios</a></li>
                <li><a href="#faq" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Preguntas</a></li>
                <li><Link href="/sign-up" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Crear cuenta</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Legal y contacto
              </div>
              <ul className="mt-3 space-y-2">
                <li><Link href="/privacidad" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Privacidad</Link></li>
                <li><Link href="/terminos" className="text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]">Términos</Link></li>
                <li>
                  <a
                    href="https://wa.me/529984292748"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-primary)]"
                  >
                    <IconWhatsApp className="h-4 w-4" /> WhatsApp
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-muted-foreground)] sm:flex-row">
          <span>© {year} All Global Holding LLC · Goossip</span>
          <a
            href="https://x.com/LuisVmomentums"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-foreground)]"
          >
            <IconX className="h-3.5 w-3.5" /> @LuisVmomentums
          </a>
        </div>
      </div>
    </footer>
  );
}
