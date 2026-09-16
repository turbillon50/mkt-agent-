/**
 * Los cuatro pasos son literalmente los del alta de proyecto y su lista de
 * arranque. No es una promesa de folleto: es lo que la app te hace hacer.
 *
 * El texto anterior prometía "X y LinkedIn se conectan con un clic" y "WhatsApp
 * llega pronto" — justo al revés de lo que hoy funciona. Una portada que
 * contradice a la propia app se nota en la primera pantalla.
 */
const steps = [
  {
    n: '01',
    title: 'Da de alta tu proyecto',
    body: 'Qué vendes, dónde y en qué idioma. Tres pasos y puedes guardar a la mitad para seguir después.',
  },
  {
    n: '02',
    title: 'Define a tu vendedor',
    body: 'Cómo habla, qué no promete nunca, en qué horario atiende y a quién le pasa la bola cuando algo lo rebasa.',
  },
  {
    n: '03',
    title: 'Conecta tus canales',
    body: 'Enlazas tu página de Facebook e Instagram y eliges de qué formularios quieres recibir a la gente. Si no lo llevas tú, mandas un enlace a quien sí.',
  },
  {
    n: '04',
    title: 'Invita a tu equipo',
    body: 'Quien atiende leads, quien conecta canales y quien solo mira. Cada quien entra a lo suyo y a nada más.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Cuatro pasos y tu vendedor <em>ya está contestando</em>.
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            En diez minutos queda armado. La lista de arranque te va diciendo qué falta, sin
            adivinar.
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
