'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  IconShare,
  IconPlus,
  IconClose,
  IconArrowUpRight,
  IconTarget,
  IconBarChart,
} from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Rule = { param: string; value: string; url: string };

type StoryLink = {
  id: string;
  slug: string;
  name: string;
  defaultUrl: string;
  rules: Rule[];
  clickCount: number;
  active: boolean;
};

const emptyRule = (): Rule => ({ param: 'utm_source', value: '', url: '' });

export function StoryLinksWorkspace() {
  const { push } = useToast();
  const [links, setLinks] = React.useState<StoryLink[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [origin, setOrigin] = React.useState('');

  const [name, setName] = React.useState('');
  const [defaultUrl, setDefaultUrl] = React.useState('');
  const [rules, setRules] = React.useState<Rule[]>([emptyRule()]);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/story-links', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setLinks(d.storyLinks ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setLinks([]);
      push({
        title: 'No se pudieron cargar los story links',
        description: String(e instanceof Error ? e.message : e),
        variant: 'error',
      });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setRule = (i: number, patch: Partial<Rule>) => {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRule = () => setRules((prev) => [...prev, emptyRule()]);
  const removeRule = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));

  const create = async () => {
    if (!name.trim()) return push({ title: 'Ponle un nombre al story link', variant: 'error' });
    if (!defaultUrl.trim()) return push({ title: 'Falta el link de destino por defecto', variant: 'error' });
    const cleanRules = rules.filter((r) => r.param.trim() && r.value.trim() && r.url.trim());
    setBusy(true);
    try {
      const r = await fetch('/api/story-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, defaultUrl, rules: cleanRules }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Story link creado!', description: 'Copia el link y úsalo en todos lados.', variant: 'success' });
      setName('');
      setDefaultUrl('');
      setRules([emptyRule()]);
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (l: StoryLink) => {
    try {
      const r = await fetch(`/api/story-links/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !l.active }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: l.active ? 'Story link pausado' : 'Story link activado', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo actualizar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (l: StoryLink) => {
    if (!confirm(`¿Eliminar el story link "${l.name}"?`)) return;
    try {
      const r = await fetch(`/api/story-links/${l.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Story link eliminado', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (l: StoryLink) => {
    const url = `${origin}/go/${l.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copiado', description: url, variant: 'success' });
    } catch {
      push({ title: 'Copia el link manualmente', description: url, variant: 'info' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Crear */}
      <Card className="h-fit">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconTarget className="h-4 w-4 text-[var(--color-primary)]" /> Nuevo story link
          </div>
          <Input placeholder="Nombre (ej. Link de bio verano)" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
              Destino por defecto (si nada matchea)
            </div>
            <Input
              placeholder="https://tu-tienda.com"
              value={defaultUrl}
              onChange={(e) => setDefaultUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-[var(--color-muted-foreground)]">Reglas de redirección</div>
              <button
                type="button"
                onClick={addRule}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:opacity-80"
              >
                <IconPlus className="h-3.5 w-3.5" /> Agregar regla
              </button>
            </div>
            {rules.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Sin reglas: todo el tráfico irá al destino por defecto.
              </p>
            ) : null}
            {rules.map((rule, i) => (
              <div key={i} className="space-y-1.5 rounded-md bg-[var(--color-muted)]/40 p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="param (utm_source)"
                    value={rule.param}
                    onChange={(e) => setRule(i, { param: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="valor (instagram)"
                    value={rule.value}
                    onChange={(e) => setRule(i, { value: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                    aria-label="Quitar regla"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  placeholder="https://destino-para-esta-regla.com"
                  value={rule.url}
                  onChange={(e) => setRule(i, { url: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>

          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear story link'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {links === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando story links…</div>
        ) : links.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">🔗</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes story links. Crea el primero y úsalo como tu link de bio inteligente.
              </p>
            </CardContent>
          </Card>
        ) : (
          links.map((l) => (
            <Card key={l.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{l.name}</h3>
                      <Badge variant={l.active ? 'default' : 'outline'}>{l.active ? 'Activo' : 'Pausado'}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLink(l)}
                      className="mt-0.5 inline-flex items-center gap-1 truncate text-sm text-[var(--color-primary)] hover:underline"
                    >
                      <IconShare className="h-3.5 w-3.5 shrink-0" /> {origin ? `${origin}/go/${l.slug}` : `/go/${l.slug}`}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
                    <IconBarChart className="h-3.5 w-3.5" /> Clicks: <b className="text-[var(--color-foreground)]">{l.clickCount}</b>
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">
                    Reglas: <b className="text-[var(--color-foreground)]">{l.rules?.length ?? 0}</b>
                  </span>
                </div>

                {l.rules && l.rules.length > 0 ? (
                  <div className="space-y-1.5 rounded-lg bg-[var(--color-muted)]/40 p-3">
                    {l.rules.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <code className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[var(--color-foreground)]">
                          {rule.param}={rule.value}
                        </code>
                        <IconArrowUpRight className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                        <span className="truncate text-[var(--color-muted-foreground)]">{rule.url}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 font-medium text-[var(--color-foreground)]">
                        default
                      </span>
                      <IconArrowUpRight className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]" />
                      <span className="truncate text-[var(--color-muted-foreground)]">{l.defaultUrl}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-[var(--color-muted)]/40 p-3 text-xs text-[var(--color-muted-foreground)]">
                    Todo el tráfico va a <span className="text-[var(--color-foreground)]">{l.defaultUrl}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(l)}>
                    <IconShare className="h-3.5 w-3.5" /> Copiar link
                  </Button>
                  <a href={`/go/${l.slug}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">Probar</Button>
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => toggle(l)}>
                    {l.active ? 'Pausar' : 'Activar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => remove(l)}>
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
