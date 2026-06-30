'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  IconShield,
  IconWhatsApp,
  IconPlus,
  IconClose,
  IconCheck,
  IconCheckCircle,
  IconSparkles,
  IconShare,
} from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  interval: string;
  benefits: string[];
  whatsappNumber: string | null;
  active: boolean;
  whatsappLink: string | null;
};

const INTERVALS = [
  { label: 'Mensual', value: 'mensual' },
  { label: 'Anual', value: 'anual' },
  { label: 'Único', value: 'único' },
];

export function MembershipsWorkspace() {
  const { push } = useToast();
  const [plans, setPlans] = React.useState<Plan[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [interval, setInterval] = React.useState('mensual');
  const [whatsappNumber, setWhatsappNumber] = React.useState('');
  const [benefits, setBenefits] = React.useState<string[]>(['']);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/memberships', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setPlans(d.plans ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setPlans([]);
      push({
        title: 'No se pudieron cargar los planes',
        description: String(e instanceof Error ? e.message : e),
        variant: 'error',
      });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setBenefitAt = (i: number, value: string) => {
    setBenefits((prev) => prev.map((b, idx) => (idx === i ? value : b)));
  };
  const addBenefit = () => setBenefits((prev) => [...prev, '']);
  const removeBenefit = (i: number) => setBenefits((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const resetForm = () => {
    setName('');
    setDescription('');
    setPrice('');
    setInterval('mensual');
    setWhatsappNumber('');
    setBenefits(['']);
  };

  const create = async () => {
    if (!name.trim()) return push({ title: 'Ponle un nombre al plan', variant: 'error' });
    if (!price.trim()) return push({ title: 'Falta el precio del plan', variant: 'error' });
    setBusy(true);
    try {
      const r = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          price,
          interval,
          whatsappNumber,
          benefits: benefits.map((b) => b.trim()).filter(Boolean),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Plan VIP creado!', description: 'Ya puedes copiar el link de WhatsApp.', variant: 'success' });
      resetForm();
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: Plan) => {
    try {
      const r = await fetch(`/api/memberships/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: p.active ? 'Plan desactivado' : 'Plan activado', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo actualizar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (p: Plan) => {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return;
    try {
      const r = await fetch(`/api/memberships/${p.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Plan eliminado', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (p: Plan) => {
    if (!p.whatsappLink) {
      return push({
        title: 'Agrega un número de WhatsApp',
        description: 'El plan necesita un número para generar el link de cierre.',
        variant: 'info',
      });
    }
    try {
      await navigator.clipboard.writeText(p.whatsappLink);
      push({ title: 'Link de WhatsApp copiado', description: 'Compártelo para cerrar la venta.', variant: 'success' });
    } catch {
      push({ title: 'Copia el link manualmente', description: p.whatsappLink, variant: 'info' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Crear */}
      <Card className="h-fit">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconShield className="h-4 w-4 text-[var(--color-primary)]" /> Nuevo plan VIP
          </div>
          <Input placeholder="Nombre (ej. Club Glow VIP)" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder="Descripción (a quién va dirigido, qué lo hace especial)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[64px]"
          />
          <Input placeholder="Precio (ej. $299)" value={price} onChange={(e) => setPrice(e.target.value)} />

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Periodicidad</div>
            <div className="flex flex-wrap gap-1.5">
              {INTERVALS.map((it) => (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => setInterval(it.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    interval === it.value
                      ? 'border-transparent bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
                  }`}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
              <IconWhatsApp className="h-3.5 w-3.5" /> Número de WhatsApp (con lada país)
            </div>
            <Input
              placeholder="Ej. 52 998 123 4567"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Beneficios del plan</div>
            <div className="space-y-2">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <IconCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                  <Input
                    placeholder={`Beneficio ${i + 1}`}
                    value={b}
                    onChange={(e) => setBenefitAt(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeBenefit(i)}
                    disabled={benefits.length <= 1}
                    className="shrink-0 rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-40"
                    aria-label="Quitar beneficio"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addBenefit}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              <IconPlus className="h-3.5 w-3.5" /> Agregar beneficio
            </button>
          </div>

          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear plan VIP'}
          </Button>

          <div className="flex items-start gap-1.5 rounded-lg bg-[var(--color-muted)]/50 p-2.5 text-xs text-[var(--color-muted-foreground)]">
            <IconSparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
            <span>Pronto: pago automático con tarjeta (Stripe/MercadoPago).</span>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {plans === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando planes…</div>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 flex justify-center text-[var(--color-primary)]">
                <IconShield className="h-8 w-8" />
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes planes VIP. Crea el primero y empieza a cerrar suscripciones por WhatsApp.
              </p>
            </CardContent>
          </Card>
        ) : (
          plans.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{p.name}</h3>
                      <Badge variant={p.active ? 'default' : 'outline'}>{p.active ? 'Activo' : 'Inactivo'}</Badge>
                    </div>
                    {p.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{p.description}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold text-[var(--color-primary)]">
                      {p.price} {p.currency}
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">/{p.interval}</div>
                  </div>
                </div>

                {p.benefits.length > 0 ? (
                  <ul className="space-y-1">
                    {p.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm">
                        <IconCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {p.whatsappNumber ? (
                  <div className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]">
                    <IconWhatsApp className="h-3.5 w-3.5" /> {p.whatsappNumber}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(p)}>
                    <IconShare className="h-3.5 w-3.5" /> Copiar link de WhatsApp
                  </Button>
                  {p.whatsappLink ? (
                    <a href={p.whatsappLink} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <IconWhatsApp className="h-3.5 w-3.5" /> Abrir WhatsApp
                      </Button>
                    </a>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                    {p.active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-destructive)]"
                    onClick={() => remove(p)}
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
