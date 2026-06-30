'use client';

import { useState, useCallback } from 'react';
import { LeadsBoard } from '@/components/leads/board';
import { ProspectSearch } from '@/components/leads/search';

export default function LeadsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
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
      <ProspectSearch onAdded={bump} />
      <LeadsBoard key={refreshKey} />
    </div>
  );
}
