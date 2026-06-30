'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IconTarget, IconPlus, IconClose, IconShare } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Landing = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  ctaLabel: string;
  campaignId: string | null;
  published: boolean;
  views: number;
  submissions: number;
};

type CampaignOption = { id: string; name: string };

export function LandingsWorkspace() {
  const { push } = useToast();
  const [landings, setLandings] = React.useState<Landing[] | null>(null);
  const [campaigns, setCampaigns] = React.useState<CampaignOption[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [origin, setOrigin] = React.useState('');

  const [title, setTitle] = React.useState('');
  const [subtitle, setSubtitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [ctaLabel, setCtaLabel] = React.useState('Quiero más información');
  const [campaignId, setCampaignId] = React.useState('');

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/campaign-landings', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setLandings(d.landings ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setLandings([]);
      push({
        title: 'No se pudieron cargar las páginas',
        description: String(e instanceof Error ? e.message : e),
        variant: 'error',
      });
    }
  }, [push]);

  const loadCampaigns = React.useCallback(async () => {
    try {
      const r = await fetch('/api/campaigns', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.campaigns)) {
        setCampaigns(d.campaigns.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch {
      /* si falla, omitimos el select de campana */
    }
  }, []);

  React.useEffect(() => {
    load();
    loadCampaigns();
  }, [load, loadCampaigns]);

  const create = async () => {
    if (!title.trim()) return push({ title: 'Ponle un título a la página', variant: 'error' });
    setBusy(true);
    try {
      const r = await fetch('/api/campaign-landings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subtitle, description, ctaLabel, campaignId: campaignId || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Página creada!', description: 'Ya puedes copiar el link y compartirlo.', variant: 'success' });
      setTitle('');
      setSubtitle('');
      setDescription('');
      setCtaLabel('Quiero más información');
      setCampaignId('');
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (l: Landing) => {
    try {
      const r = await fetch(`/api/campaign-landings/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !l.published }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: l.published ? 'Página despublicada' : 'Página publicada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo actualizar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (l: Landing) => {
    if (!confirm(`¿Eliminar la página "${l.title}"?`)) return;
    try {
      const r = await fetch(`/api/campaign-landings/${l.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Página eliminada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (l: Landing) => {
    const url = `${origin}/c/${l.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copiado', description: url, variant: 'success' });
    } catch {
      push({ title: 'Copia el link manualmente', description: url, variant: 'info' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Crear */}
      <Card className="h-fit">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconTarget className="h-4 w-4 text-[var(--color-primary)]" /> Nueva página de venta
          </div>
          <Input placeholder="Título (ej. Lanzamiento glow 2026)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Subtítulo (opcional)" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          <Textarea
            placeholder="Descripción (qué ofreces, por qué importa)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[96px]"
          />
          <Input
            placeholder="Texto del botón (CTA)"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
          />
          {campaigns.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Campaña (opcional)</div>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              >
                <option value="">Sin campaña</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear página'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {landings === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando páginas…</div>
        ) : landings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">🎯</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes páginas de venta. Crea la primera y compártela con tu audiencia.
              </p>
            </CardContent>
          </Card>
        ) : (
          landings.map((l) => (
            <Card key={l.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{l.title}</h3>
                      <Badge variant={l.published ? 'default' : 'outline'}>
                        {l.published ? 'Publicada' : 'Borrador'}
                      </Badge>
                    </div>
                    {l.subtitle ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{l.subtitle}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">
                    Visitas: <b className="text-[var(--color-foreground)]">{l.views}</b>
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">
                    Registros: <b className="text-[var(--color-foreground)]">{l.submissions}</b>
                  </span>
                </div>

                <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                  {origin ? `${origin}/c/${l.slug}` : `/c/${l.slug}`}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(l)}>
                    <IconShare className="h-3.5 w-3.5" /> Copiar link
                  </Button>
                  <a href={`/c/${l.slug}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">
                      Ver página
                    </Button>
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => togglePublished(l)}>
                    {l.published ? 'Despublicar' : 'Publicar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-destructive)]"
                    onClick={() => remove(l)}
                  >
                    <IconClose className="h-3.5 w-3.5" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
