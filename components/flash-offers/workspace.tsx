'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IconBolt, IconPlus, IconClose, IconShare } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';
import { Countdown } from '@/components/public/countdown';

type Offer = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string;
  destinationUrl: string;
  endsAt: string;
  active: boolean;
  clickCount: number;
  conversionCount: number;
};

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '3 horas', minutes: 180 },
  { label: '12 horas', minutes: 720 },
  { label: '24 horas', minutes: 1440 },
  { label: '3 días', minutes: 4320 },
];

export function FlashOffersWorkspace() {
  const { push } = useToast();
  const [offers, setOffers] = React.useState<Offer[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [origin, setOrigin] = React.useState('');

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [destinationUrl, setDestinationUrl] = React.useState('');
  const [durationMinutes, setDurationMinutes] = React.useState(60);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/flash-offers', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setOffers(d.offers ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setOffers([]);
      push({ title: 'No se pudieron cargar las ofertas', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return push({ title: 'Ponle un nombre a la oferta', variant: 'error' });
    if (!destinationUrl.trim()) return push({ title: 'Falta el link de destino', variant: 'error' });
    setBusy(true);
    try {
      const r = await fetch('/api/flash-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, price, destinationUrl, durationMinutes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Oferta creada!', description: 'Ya puedes copiar el link y compartirlo.', variant: 'success' });
      setName(''); setDescription(''); setPrice(''); setDestinationUrl(''); setDurationMinutes(60);
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (o: Offer) => {
    try {
      const r = await fetch(`/api/flash-offers/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !o.active }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: o.active ? 'Oferta pausada' : 'Oferta activada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo actualizar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (o: Offer) => {
    if (!confirm(`¿Eliminar la oferta "${o.name}"?`)) return;
    try {
      const r = await fetch(`/api/flash-offers/${o.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Oferta eliminada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (o: Offer) => {
    const url = `${origin}/oferta/${o.slug}`;
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
            <IconBolt className="h-4 w-4 text-[var(--color-primary)]" /> Nueva oferta flash
          </div>
          <Input placeholder="Nombre (ej. Pack glow 2x1)" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder="Descripción corta (qué incluye, por qué ahora)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[64px]"
          />
          <Input placeholder="Precio (ej. $499)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Input
            placeholder="Link de destino (pago / landing)"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
          />
          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Duración del countdown</div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  type="button"
                  onClick={() => setDurationMinutes(d.minutes)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    durationMinutes === d.minutes
                      ? 'border-transparent bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear oferta'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {offers === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando ofertas…</div>
        ) : offers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">⚡</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes ofertas. Crea la primera y compártela en tu próximo live.
              </p>
            </CardContent>
          </Card>
        ) : (
          offers.map((o) => {
            const live = o.active && new Date(o.endsAt).getTime() > Date.now();
            return (
              <Card key={o.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{o.name}</h3>
                        <Badge variant={live ? 'default' : 'outline'}>{live ? 'Activa' : o.active ? 'Terminada' : 'Pausada'}</Badge>
                      </div>
                      {o.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{o.description}</p>
                      ) : null}
                    </div>
                    {o.price ? <div className="shrink-0 text-lg font-bold text-[var(--color-primary)]">{o.price}</div> : null}
                  </div>

                  {live ? (
                    <div className="rounded-lg bg-[var(--color-muted)]/50 p-3">
                      <Countdown endsAt={new Date(o.endsAt).toISOString()} />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-[var(--color-muted-foreground)]">
                      Clicks: <b className="text-[var(--color-foreground)]">{o.clickCount}</b>
                    </span>
                    <span className="text-[var(--color-muted-foreground)]">
                      Conversiones: <b className="text-[var(--color-foreground)]">{o.conversionCount}</b>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => copyLink(o)}>
                      <IconShare className="h-3.5 w-3.5" /> Copiar link
                    </Button>
                    <a href={`/oferta/${o.slug}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">Ver página</Button>
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => toggle(o)}>
                      {o.active ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => remove(o)}>
                      <IconClose className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
