import Link from 'next/link';
import { IconArrowRight, IconCheck } from '@/components/icons';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)]">
      <div aria-hidden className="mesh" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-28 lg:py-32">
        <div className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-card)]/70 px-3.5 py-1.5 text-xs font-medium text-[var(--color-foreground-muted)] backdrop-blur">
          <span className="dot-pulse text-[var(--color-primary)]">
            <span className="block h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          <span>Early access abierto · sin tarjeta</span>
        </div>

        <h1 className="fade-up delay-100 text-balance text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.5rem]">
          Crece tu audiencia.
          <br className="hidden sm:block" />{' '}
          <span className="brand-gradient">Vende más.</span> Sin perder
          <br className="hidden sm:block" />{' '}
          el día en redes.
        </h1>

        <p className="fade-up delay-200 mx-auto mt-6 max-w-2xl text-balance text-base text-[var(--color-foreground-muted)] sm:mt-8 sm:text-lg lg:text-xl">
          Goossip crea tu contenido, atrae seguidores y los convierte en clientes —
          en todas tus redes, todos los días, mientras tú haces lo tuyo.
        </p>

        <div className="fade-up delay-300 relative z-20 mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-11 sm:flex-row sm:items-center">
          <Link
            href="/sign-up"
            prefetch
            className="btn-brand inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold active:scale-[0.98]"
          >
            Empieza gratis <IconArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#how"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)]/50 px-7 py-3.5 text-base font-medium backdrop-blur transition-colors hover:bg-[var(--color-accent)]"
          >
            Ver demo
          </Link>
        </div>

        <div className="fade-up delay-400 mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted-foreground)]">
          {['Sin tarjeta', 'Listo en 2 minutos', 'Cancela cuando quieras'].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <IconCheck className="h-3.5 w-3.5 text-[var(--color-success)]" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
