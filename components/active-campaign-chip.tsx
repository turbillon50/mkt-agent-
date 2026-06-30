'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconChevronDown, IconFolder, IconPlus } from '@/components/icons';
import { cn } from '@/lib/utils';

type Campaign = {
  id: string;
  name: string;
  slug: string;
};

export function ActiveCampaignChip({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const res = await fetch('/api/campaigns', { cache: 'no-store' });
      const data = await res.json();
      setItems(data?.campaigns ?? []);
      setActiveId(data?.activeCampaignId ?? null);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function activate(id: string) {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`/api/campaigns/${id}/activate`, { method: 'POST' });
      setActiveId(id);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <Link
        href="/campaigns"
        onClick={onNavigate}
        className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        <span className="flex items-center gap-2">
          <IconPlus className="h-3.5 w-3.5" />
          Crear primera campaña
        </span>
      </Link>
    );
  }

  const active = items.find((c) => c.id === activeId) ?? items[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/80 px-3 py-2 text-xs hover:bg-[var(--color-accent)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <IconFolder className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
          <span className="truncate font-medium">{active?.name ?? 'Sin campaña'}</span>
        </span>
        <IconChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => activate(c.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs',
                c.id === activeId ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]' : 'hover:bg-[var(--color-accent)]/60',
              )}
            >
              <span className="truncate">{c.name}</span>
              {c.id === activeId && (
                <span className="rounded bg-[var(--color-success)]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-success)]">
                  activa
                </span>
              )}
            </button>
          ))}
          <Link
            href="/campaigns"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="mt-1 flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            <IconPlus className="h-3 w-3" />
            Nueva campaña
          </Link>
        </div>
      )}
    </div>
  );
}
