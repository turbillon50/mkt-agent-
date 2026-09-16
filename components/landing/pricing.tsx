import Link from 'next/link';
import { IconCheck } from '@/components/icons';

const tiers = [
  {
    name: 'Solo',
    price: 'Gratis',
    cadence: 'mientras estamos empezando',
    cta: 'Empezar gratis',
    href: '/sign-up',
    features: [
      'Un proyecto con todos sus canales',
      'Facebook, Instagram y tu sitio web',
      'Tu vendedor contestando',
      'Tus leads calificados y ordenados',
      'Invita a tu equipo',
    ],
    featured: true,
  },
  {
    name: 'Pro',
    price: '$29',
    cadence: '/ mes · pronto',
    cta: 'Avísame cuando esté',
    href: '/sign-up',
    features: [
      'Todo lo de Solo',
      'Varios proyectos a la vez',
      'WhatsApp y Google',
      'Reporte semanal de cómo vas',
      'Un vendedor distinto por proyecto',
    ],
    featured: false,
  },
  {
    name: 'Team',
    price: '$99',
    cadence: '/ mes · pronto',
    cta: 'Lista de espera',
    href: '/sign-up',
    features: [
      'Todo lo de Pro',
      'Hasta 5 personas en tu equipo',
      'Aprobaciones antes de que salga nada',
      'Tu marca en todos los proyectos',
      'Te contestamos primero',
    ],
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Plan simple, <span className="brand-gradient">honesto</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            Goossip apenas está empezando. Mientras tanto es gratis para quien lo quiera usar.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.featured
                  ? 'border-[var(--color-primary)]/40 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-secondary)]/10 shadow-xl shadow-[var(--color-primary)]/10'
                  : 'border-[var(--color-border)] bg-[var(--color-card)]/60'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{t.name}</h3>
                {t.featured && (
                  <span className="rounded-md bg-[var(--color-primary)]/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-primary)]">
                    Gratis
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold">{t.price}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">{t.cadence}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={t.href}
                className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium ${
                  t.featured
                    ? 'btn-brand shadow-lg shadow-[var(--color-primary)]/20 font-semibold'
                    : 'border border-[var(--color-border)] hover:bg-[var(--color-accent)]'
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
