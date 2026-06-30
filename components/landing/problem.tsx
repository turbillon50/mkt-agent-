const pains = [
  {
    n: '01',
    title: 'Pasas horas creando contenido que nadie ve',
    body: 'Grabas, editas, escribes, publicas… y el alcance no llega. El día se va y los números no se mueven.',
  },
  {
    n: '02',
    title: 'Tus seguidores no se convierten en clientes',
    body: 'Tienes audiencia, pero no ventas. Likes que no pagan la renta y mensajes que se quedan sin responder.',
  },
  {
    n: '03',
    title: 'Cada plataforma es un trabajo diferente',
    body: 'X, Instagram, TikTok, WhatsApp… cada una con su formato, su horario y su lógica. Es agotador y no escala.',
  },
];

export function Problem() {
  return (
    <section className="relative overflow-hidden bg-[#1a0f17] text-[#fbf7f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(at 0% 0%, rgba(214,51,108,0.22) 0px, transparent 45%), radial-gradient(at 100% 100%, rgba(107,37,69,0.35) 0px, transparent 50%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff7da6]">
            Suena familiar
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Las redes te están quitando el tiempo
            <br className="hidden sm:block" />{' '}
            <span className="text-[#ff7da6]">y no te están dando dinero.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {pains.map((p) => (
            <div
              key={p.n}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-[#ff5d8f]/40"
            >
              <div className="font-mono text-sm text-[#ff7da6]">{p.n}</div>
              <h3 className="mt-3 text-lg font-semibold leading-snug">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
