import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)]">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-[120px]" />
        <div className="absolute -bottom-40 right-1/4 h-[420px] w-[620px] rounded-full bg-violet-500/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-32">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3 w-3 text-fuchsia-400" />
          <span>Tu agente social autónomo</span>
        </div>

        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Tu marca, en redes,{' '}
          <span className="brand-gradient">sin que muevas un dedo</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-[var(--color-muted-foreground)] sm:text-lg">
          Goossip planea, redacta, publica y conversa por ti en X, LinkedIn y WhatsApp. Aprende tu
          voz, evita repetirse y opera 24/7 con la estrategia que tú defines.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="btn-brand inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-medium shadow-lg shadow-fuchsia-500/30 transition-transform hover:scale-[1.02]"
          >
            Empezar gratis <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-6 py-3 text-sm hover:bg-[var(--color-accent)]"
          >
            Ya tengo cuenta
          </Link>
        </div>

        <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
          Sin tarjeta · Conectas X, LinkedIn y WhatsApp en minutos · Tu copy, tu plan, tu marca
        </p>
      </div>
    </section>
  );
}
