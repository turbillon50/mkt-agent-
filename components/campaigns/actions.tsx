'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function CampaignActions({
  campaignId,
  isActive,
  status,
}: {
  campaignId: string;
  isActive: boolean;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function activate() {
    setBusy('activate');
    try {
      await fetch(`/api/campaigns/${campaignId}/activate`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (!confirm('¿Archivar esta campaña? La puedes reactivar después.')) return;
    setBusy('archive');
    try {
      await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      router.push('/campaigns');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isActive && (
        <Button onClick={activate} disabled={busy !== null} className="btn-brand">
          {busy === 'activate' ? 'Activando…' : 'Activar esta campaña'}
        </Button>
      )}
      {status !== 'archived' && (
        <Button onClick={archive} variant="outline" disabled={busy !== null}>
          {busy === 'archive' ? 'Archivando…' : 'Archivar'}
        </Button>
      )}
    </div>
  );
}
