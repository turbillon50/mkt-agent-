'use client';

type Item = {
  fromNumber: string;
  lastBody: string | null;
  lastAt: string;
  messages: number;
};

export function ConversationsList({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {items.map((c) => (
        <li key={c.fromNumber} className="flex items-center gap-3 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500/40 to-teal-500/40 text-xs font-semibold">
            {c.fromNumber.slice(-2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">+{c.fromNumber}</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">{c.lastAt}</span>
            </div>
            <p className="line-clamp-1 text-xs text-[var(--color-muted-foreground)]">
              {c.lastBody ?? '—'}
            </p>
          </div>
          <span className="rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
            {c.messages}
          </span>
        </li>
      ))}
    </ul>
  );
}
