import { IconStar } from '@/components/icons';

/* TODO: reemplazar con testimonios REALES cuando estén disponibles (foto, nombre, frase). */
const testimonials = [
  {
    quote:
      'Antes pasaba dos horas al día en redes y vendía poco. Ahora Goossip publica por mí y los DMs llegan solos. Cerré 8 clientes el primer mes.',
    name: 'Carlos M.',
    role: 'Coach de ventas · CDMX',
    initials: 'CM',
  },
  {
    quote:
      'Lo de venta por comentario es magia. La gente comenta una palabra y le llega el link. Mis lanzamientos ahora se sienten profesionales.',
    name: 'Daniela R.',
    role: 'Creadora de contenido · Guadalajara',
    initials: 'DR',
  },
  {
    quote:
      'Manejo tres marcas y no me daba la vida. Con los workspaces de Goossip por fin tengo todo ordenado y vendiendo en automático.',
    name: 'Andrés P.',
    role: 'Agencia de marketing · Monterrey',
    initials: 'AP',
  },
];

export function Testimonials() {
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Historias reales
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Gente que dejó de pelear con las redes{' '}
            <span className="brand-gradient">y empezó a vender</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.name} className="card-glow flex flex-col rounded-2xl p-6">
              <div className="flex gap-0.5 text-[var(--color-primary)]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <IconStar key={i} className="h-4 w-4" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-[var(--color-foreground)]">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] text-sm font-semibold text-[var(--color-primary-foreground)]">
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
