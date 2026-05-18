'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function CreateCampaignForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [voice, setVoice] = useState('');
  const [audience, setAudience] = useState('');
  const [language, setLanguage] = useState('es');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    if (name.trim().length < 2) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          brandName: name.trim(),
          brandVoice: voice.trim() || null,
          audience: audience.trim() || null,
          brandLanguage: language || 'es',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setName('');
      setVoice('');
      setAudience('');
      router.refresh();
      router.push(`/campaigns/${data.campaign.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la campaña (ej. VLiving)" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Voz (ej. luxury, consultiva)" />
        <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audiencia (ej. inversionistas 35-55)" />
      </div>
      <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Idioma (es)" />
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {error ? <span className="text-rose-300">{error}</span> : 'Después podrás cargar el manifiesto completo.'}
        </p>
        <Button onClick={submit} disabled={submitting} className="btn-brand">
          {submitting ? 'Creando…' : 'Crear campaña'}
        </Button>
      </div>
    </div>
  );
}
