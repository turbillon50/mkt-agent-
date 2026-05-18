export function Networks() {
  const items = [
    { name: 'X / Twitter', tag: 'Live' },
    { name: 'LinkedIn', tag: 'Live' },
    { name: 'WhatsApp', tag: 'Live' },
    { name: 'Instagram', tag: 'Próximo' },
    { name: 'Facebook', tag: 'Próximo' },
    { name: 'TikTok', tag: 'Próximo' },
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
              className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center"
            >
              <span className="text-sm font-medium">{it.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  it.tag === 'Live'
                    ? 'bg-emerald-500/20 text-emerald-300'
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
