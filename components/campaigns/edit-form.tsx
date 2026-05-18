'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  brandName: string | null;
  brandVoice: string | null;
  brandTopics: string | null;
  brandLanguage: string | null;
  audience: string | null;
  manifesto: string | null;
};

export function CampaignEditForm({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [brandVoice, setBrandVoice] = useState(campaign.brandVoice ?? '');
  const [brandTopics, setBrandTopics] = useState(campaign.brandTopics ?? '');
  const [brandLanguage, setBrandLanguage] = useState(campaign.brandLanguage ?? 'es');
  const [audience, setAudience] = useState(campaign.audience ?? '');
  const [manifesto, setManifesto] = useState(campaign.manifesto ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          brandVoice: brandVoice || null,
          brandTopics: brandTopics || null,
          brandLanguage: brandLanguage || 'es',
          audience: audience || null,
          manifesto: manifesto || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setFeedback({ ok: true, msg: 'Guardado.' });
      router.refresh();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    const text = await file.text();
    setManifesto(text);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Idioma</label>
          <Input value={brandLanguage} onChange={(e) => setBrandLanguage(e.target.value)} placeholder="es" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Descripción interna</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué es esta campaña" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Voz</label>
          <Input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="luxury, consultiva, irreverente…" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Audiencia</label>
          <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="inversionistas 35-55" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Temas (separados por coma)</label>
        <Input value={brandTopics} onChange={(e) => setBrandTopics(e.target.value)} placeholder="real estate, inversión, retiro" />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-[var(--color-muted-foreground)]">
            Manifiesto de la campaña
            <span className="ml-2 text-[10px] uppercase tracking-wider">opcional · sobreescribe la voz default de Goossip</span>
          </label>
          <label className="cursor-pointer text-xs text-fuchsia-300 hover:underline">
            Cargar archivo
            <input
              type="file"
              accept=".txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
              }}
            />
          </label>
        </div>
        <Textarea
          value={manifesto}
          onChange={(e) => setManifesto(e.target.value)}
          placeholder="Pega aquí el manifiesto: identidad, valores, líneas rojas, ejemplos de tono, casos de uso, lo que SÍ y lo que NO se dice. Goossip lo usará como su brújula al hablar de esta campaña."
          className="min-h-[260px] font-mono text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs">
          {feedback ? (
            <span className={feedback.ok ? 'text-emerald-300' : 'text-rose-300'}>{feedback.msg}</span>
          ) : (
            <span className="text-[var(--color-muted-foreground)]">Los cambios aplican al siguiente mensaje del agente.</span>
          )}
        </p>
        <Button onClick={save} disabled={saving} className="btn-brand">
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
