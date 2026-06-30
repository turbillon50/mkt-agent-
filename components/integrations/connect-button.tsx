'use client';

import * as React from 'react';

export function ConnectButton({
  toolkit,
  connected,
  label,
}: {
  toolkit: 'twitter' | 'linkedin' | 'gmail' | 'outlook';
  connected: boolean;
  label: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/composio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolkit }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || 'No se pudo iniciar la conexión');
      }
      window.location.href = data.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)]">
        <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
        Conectado
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="btn-brand rounded-md px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {loading ? 'Abriendo…' : label}
      </button>
      {error && <span className="text-[10px] text-[var(--color-warning)]">{error}</span>}
    </div>
  );
}
