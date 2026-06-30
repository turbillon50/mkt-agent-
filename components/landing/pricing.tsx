import Link from 'next/link';
import { IconCheck } from '@/components/icons';

const tiers = [
  {
    name: 'Solo',
    price: 'Gratis',
    cadence: 'early access',
    tagline: 'Para empezar a crecer hoy mismo.',
    cta: 'Empieza gratis',
    href: '/sign-up',
    features: [
      'X + LinkedIn + WhatsApp',
      'Publicación automática',
      'CRM básico de prospectos',
      'Memoria de marca (tu voz)',
      'Chat ilimitado con tu agente',
    ],
    featured: false,
  },
  {
    name: 'Pro',
    price: '$299',
    cadence: 'MXN / mes',
    tagline: 'Para vender en serio en todas tus redes.',
    cta: 'Probar Pro',
    href: '/sign-up',
    features: [
      'Todo lo de Solo, sin límites',
      'Mailing inteligente',
      'Ofertas Flash con cuenta regresiva',
      'Mapa de prospectos + embudo automático',
      'DM automático con IA',
      'Landing por campaña',
    ],
    featured: true,
  },
  {
    name: 'Agency',
    price: '$799',
    cadence: 'MXN / mes',
    tagline: 'Para quien maneja varias marcas.',
    cta: 'Hablar con ventas',
    href: '/sign-up',
    features: [
      'Todo lo de Pro',
      'Workspaces múltiples',
      'Embajadores gamificados',
      'Reporting avanzado por marca',
      'Soporte prioritario',
    ],
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Precios
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Empieza gratis. <span className="brand-gradient">Crece cuando quieras.</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            Precios en pesos, pensados para LATAM. Sin contratos, sin letras chiquitas.
            Cancela cuando quieras.
          </p>
        </div>

        <div className="mt-14 grid items-start gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-2xl p-7 ${
                t.featured
                  ? 'card-premium bg-gradient-to-br from-[var(--color-primary)]/[0.08] to-[var(--color-secondary)]/[0.06] shadow-xl shadow-[var(--color-primary)]/10 lg:-mt-3 lg:pb-9'
                  : 'border border-[var(--color-border)] bg-[var(--color-card)]/60'
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full btn-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  Recomendado
                </span>
              )}
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{t.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
                <span className="text-sm text-[var(--color-muted-foreground)]">{t.cadence}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={t.href}
                className={`mt-7 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  t.featured
                    ? 'btn-brand'
                    : 'border border-[var(--color-border-strong)] hover:bg-[var(--color-accent)]'
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-[var(--color-muted-foreground)]">
          Goossip está en early access. Los precios de lanzamiento pueden subir conforme
          agregamos funciones — si entras hoy, conservas tu tarifa.
        </p>
      </div>
    </section>
  );
}
