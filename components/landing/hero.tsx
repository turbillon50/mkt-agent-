import Link from 'next/link';
import { IconArrowRight, IconSignal } from '@/components/icons';

/** Conversación de ejemplo — ilustrativa, no real. Piel velvet aprobada por Luis 2026-10-02. */
const MENSAJES: Array<{ de: 'lead' | 'goossip'; texto: string }> = [
  { de: 'lead', texto: 'Hola! Vi el anuncio del depa en Tulum. Cuánto cuesta?' },
  { de: 'goossip', texto: '¡Hola Ana! 👋 El depa de 2 recámaras parte desde $4.9M MXN. ¿Lo buscas para invertir o para vivir?' },
  { de: 'lead', texto: 'Para invertir 🏖️' },
  { de: 'goossip', texto: 'Perfecto. En renta proyecta alrededor de 8% anual. ¿Qué presupuesto tienes en mente?' },
  { de: 'lead', texto: 'Como 5 millones' },
  { de: 'goossip', texto: 'Entra en tu rango ✅ Te paso con Luis, nuestro asesor, para agendar una visita esta semana.' },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)]">
      <div aria-hidden className="mesh" />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div className="text-center lg:text-left">
          <div className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-card)]/60 px-3.5 py-1.5 text-xs text-[var(--color-foreground-muted)] backdrop-blur lg:mx-0">
            <IconSignal className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            <span>Tu vendedor, contestando · 24/7</span>
          </div>
          <h1 className="fade-up delay-100 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.022em] sm:text-6xl lg:text-7xl">
            Tus leads, atendidos,
            <br className="hidden sm:block" />{' '}
            <span className="brand-gradient">antes de que se enfríen</span>
          </h1>
          <p className="fade-up delay-200 mx-auto mt-6 max-w-lg text-balance text-base text-[var(--color-foreground-muted)] sm:mt-8 sm:text-lg lg:mx-0">
            Goossip recibe a la gente de tus anuncios, la califica, le contesta con tu tono y te
            avisa cuando alguien está listo para comprar. Un proyecto, sus canales y su equipo.
          </p>
          <div className="fade-up delay-300 relative z-20 mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:items-center lg:justify-start">
            <Link href="/sign-up" prefetch={true} className="btn-brand inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold active:scale-[0.98] sm:text-sm">
              Empezar gratis <IconArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sign-in" prefetch={true} className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-card)]/40 px-7 py-3.5 text-base backdrop-blur transition-colors hover:bg-[var(--color-accent)] sm:text-sm">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="fade-up delay-400 mt-7 text-xs text-[var(--color-muted-foreground)]">
            Sin tarjeta · Facebook e Instagram · WhatsApp · Tu voz, tus precios, tus reglas
          </p>
        </div>
        <div className="chat-demo fade-up delay-300 mx-auto w-full max-w-md lg:max-w-none">
          <div className="hd">
            <span className="ava" aria-hidden>AR</span>
            <div>
              <p className="text-sm font-semibold leading-tight">Ana Rivera</p>
              <p className="text-xs font-medium text-[var(--color-primary)]">Instagram · Lista para comprar</p>
            </div>
          </div>
          <div className="thread">
            {MENSAJES.map((m, i) => (
              <div key={i} className={m.de === 'lead' ? 'bub bub-in' : 'bub bub-out'}>
                {m.texto}
              </div>
            ))}
            <span className="chat-sys">✓ Escalado a Luis · hace 2 min</span>
          </div>
          <p className="chat-note">Ejemplo ilustrativo de una conversación calificada</p>
        </div>
      </div>
    </section>
  );
}
