import {
  IconX,
  IconLinkedIn,
  IconInstagram,
  IconTikTok,
  IconFacebook,
  IconWhatsApp,
  IconGoogleAds,
} from '@/components/icons';

const networks = [
  { name: 'X', icon: IconX },
  { name: 'LinkedIn', icon: IconLinkedIn },
  { name: 'Instagram', icon: IconInstagram },
  { name: 'TikTok', icon: IconTikTok },
  { name: 'Facebook', icon: IconFacebook },
  { name: 'WhatsApp', icon: IconWhatsApp },
  { name: 'Google Ads', icon: IconGoogleAds },
];

export function Networks() {
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-center text-sm font-medium text-[var(--color-foreground-muted)]">
          Todas tus redes, un solo lugar.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {networks.map(({ name, icon: Icon }) => (
            <div
              key={name}
              className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 transition-colors hover:border-[var(--color-border-strong)]"
            >
              <Icon className="h-5 w-5 text-[var(--color-foreground-muted)] transition-colors group-hover:text-[var(--color-primary)]" />
              <span className="text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
