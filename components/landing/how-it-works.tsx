const steps = [
  {
    n: '01',
    title: 'Configura tu marca',
    body: 'Voz, temas, idioma, red social. Sube documentos a Memoria (FAQ, manifiesto, ejemplos de tono) y Goossip los recuerda para siempre.',
  },
  {
    n: '02',
    title: 'Conecta tus canales',
    body: 'X y LinkedIn se conectan con un clic, sin que tengas que crear apps de desarrollador. WhatsApp llega pronto vía Business API oficial.',
  },
  {
    n: '03',
    title: 'Plan + autopublicación',
    body: 'Cada lunes Goossip arma el plan de la semana. Cada día publica según tu cron y guarda métricas, sin tu intervención.',
  },
  {
    n: '04',
    title: 'Chat con tu agente',
    body: 'Pídele drafts, ideas, que recuerde algo, que mande un WhatsApp. Tiene herramientas propias y sabe cuándo usarlas.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Cuatro pasos. Ningún <em>“deja que lo escribo yo”</em>.
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            En 10 minutos Goossip está vivo. En una semana ya no recuerdas qué se sentía abrir cada
            red para postear.
          </p>
        </div>

        <ol className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-6"
            >
              <div className="text-xs font-mono brand-gradient">{s.n}</div>
              <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
