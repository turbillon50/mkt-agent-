import { IconX, IconLinkedIn, IconWhatsApp } from '@/components/icons';

export function Networks() {
  const items = [
    { name: 'X / Twitter', tag: 'Live', icon: IconX },
    { name: 'LinkedIn', tag: 'Live', icon: IconLinkedIn },
    { name: 'WhatsApp', tag: 'Live', icon: IconWhatsApp },
    { name: 'Instagram', tag: 'Próximo', icon: null },
    { name: 'Facebook', tag: 'Próximo', icon: null },
    { name: 'TikTok', tag: 'Próximo', icon: null },
  ];
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
          Redes soportadas
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((it) => (
            <div
              key={it.name}
              className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center"
            >
              {it.icon ? (
                <it.icon className="h-5 w-5 text-[var(--color-foreground-muted)]" />
              ) : (
                <span className="h-5 w-5" />
              )}
              <span className="text-sm font-medium">{it.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  it.tag === 'Live'
                    ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                    : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                }`}
              >
                {it.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
