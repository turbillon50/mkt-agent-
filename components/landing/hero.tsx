import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)]">
      <div aria-hidden className="mesh" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-28 lg:py-36">
        <div className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-card)]/60 px-3.5 py-1.5 text-xs text-[var(--color-foreground-muted)] backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" />
          <span>Tu agente social autónomo · 24/7</span>
        </div>

        <h1 className="fade-up delay-100 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          Tu marca, en redes,
          <br className="hidden sm:block" />{' '}
          <span className="brand-gradient">sin que muevas un dedo</span>
        </h1>

        <p className="fade-up delay-200 mx-auto mt-6 max-w-2xl text-balance text-base text-[var(--color-foreground-muted)] sm:mt-8 sm:text-lg lg:text-xl">
          Goossip planea, redacta, publica y conversa por ti en X, LinkedIn y WhatsApp.
          Aprende tu voz, evita repetirse y opera con la estrategia que tú defines.
        </p>

        <div className="fade-up delay-300 relative z-20 mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:items-center">
          <Link
            href="/sign-up"
            prefetch={true}
            className="btn-brand inline-flex items-center justify-center gap-2 rounded-lg px-7 py-3.5 text-base font-medium active:scale-[0.98] sm:text-sm"
          >
            Empezar gratis <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sign-in"
            prefetch={true}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-card)]/40 px-7 py-3.5 text-base backdrop-blur transition-colors hover:bg-[var(--color-accent)] sm:text-sm"
          >
            Ya tengo cuenta
          </Link>
        </div>

        <p className="fade-up delay-400 mt-7 text-xs text-[var(--color-muted-foreground)]">
          Sin tarjeta · X · LinkedIn · WhatsApp · Tu copy, tu plan, tu marca
        </p>
      </div>
    </section>
  );
}
