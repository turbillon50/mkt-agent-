import { IconChevronDown } from '@/components/icons';

const faqs = [
  {
    q: '¿Necesito saber de programación?',
    a: 'No. Conectas tus redes con un clic y Goossip hace el resto. Si sabes mandar un WhatsApp, sabes usar Goossip.',
  },
  {
    q: '¿Mis seguidores van a notar que es IA?',
    a: 'No. Goossip aprende tu voz, tu tono y tus expresiones. Publica y responde como lo harías tú — no con frases genéricas de robot.',
  },
  {
    q: '¿Funciona para TikTok?',
    a: 'Sí. Goossip trabaja con TikTok, Instagram, X, Facebook, LinkedIn, WhatsApp y Google Ads desde un solo lugar.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Cuando quieras, sin contratos ni penalizaciones. Cancelas con un clic y conservas tu cuenta hasta el fin del periodo pagado.',
  },
  {
    q: '¿Qué pasa con mi información?',
    a: 'Tus datos son tuyos y privados. No los vendemos ni los compartimos con terceros. Tú controlas qué se publica y qué no.',
  },
];

export function FAQ() {
  return (
    <section id="faq" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Preguntas frecuentes
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Lo que todos preguntan <span className="brand-gradient">antes de empezar</span>
          </h2>
        </div>

        <div className="mt-12 divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/40">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <IconChevronDown className="h-5 w-5 shrink-0 text-[var(--color-muted-foreground)] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
