'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LeadsBoard } from '@/components/leads/board';
import { ProspectSearch } from '@/components/leads/search';

const LeadsMap = dynamic(() => import('@/components/leads/leads-map').then((m) => m.LeadsMap), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] min-h-[360px] w-full animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40" />
  ),
});

export default function LeadsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Prospectos</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Busca negocios reales o pega links de perfiles públicos. Léelo desde el chat cuando
          quieras redactar el primer mensaje.
        </p>
      </header>

      <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5">
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              view === v
                ? 'btn-brand font-medium'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            }`}
          >
            {v === 'list' ? 'Lista' : 'Mapa'}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <>
          <ProspectSearch onAdded={bump} />
          <LeadsBoard key={refreshKey} />
        </>
      ) : (
        <LeadsMap key={`map-${refreshKey}`} />
      )}
    </div>
  );
}
