import { IconPlug, IconBrain, IconTrendUp } from '@/components/icons';

const steps = [
  {
    n: '1',
    icon: IconPlug,
    title: 'Conecta tus redes en 2 minutos',
    body: 'Vinculas X, Instagram, TikTok, WhatsApp y más con un clic. Sin código, sin apps de desarrollador, sin complicaciones.',
  },
  {
    n: '2',
    icon: IconBrain,
    title: 'El agente aprende tu voz y tu estrategia',
    body: 'Goossip estudia tu marca, tu tono y tu producto. Cada publicación suena a ti — nunca a robot ni a plantilla.',
  },
  {
    n: '3',
    icon: IconTrendUp,
    title: 'Tu audiencia crece y compra',
    body: 'Publica, responde y vende en automático todos los días. Tú revisas resultados; Goossip hace el trabajo pesado.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Cómo funciona
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            De cero a vendiendo en <span className="brand-gradient">tres pasos</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            En lo que te tomas un café, Goossip ya está trabajando para ti.
          </p>
        </div>

        <ol className="relative mt-16 grid gap-8 md:grid-cols-3 md:gap-6">
          <div
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-[var(--color-border-strong)] to-transparent md:block"
          />
          {steps.map(({ n, icon: Icon, title, body }) => (
            <li key={n} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl btn-brand text-xl font-bold">
                {n}
              </div>
              <div className="mt-5 inline-flex items-center gap-2 text-[var(--color-primary)]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-2 text-lg font-semibold">{title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
