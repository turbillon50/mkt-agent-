'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';
import { IconPlus, IconCheck } from '@/components/icons';
import { ProjectForm, type ProjectFormValues } from './project-form';
import type { ChannelStatus } from '@/src/sales/projects';

/** Lo que devuelve /api/projects: la fila cruda + el estado de canales. */
interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  kind: ProjectFormValues['kind'];
  sellerPersona: string | null;
  audience: string | null;
  channels: ProjectFormValues['channels'] | null;
  rules: ProjectFormValues['rules'] | null;
  mcpSources: ProjectFormValues['mcpSources'] | null;
  channelStatus: ChannelStatus;
}

const KIND_LABEL: Record<string, string> = {
  real_estate: 'Inmobiliario',
  mlm: 'Redes / MLM',
  marketplace: 'Marketplace',
  servicios: 'Servicios',
};

function Dot({ on, label, detail }: { on: boolean; label: string; detail?: string }) {
  return (
    <span
      title={detail}
      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/60 px-2 py-1 text-[11px]"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? '#2ba87a' : 'transparent', border: on ? 'none' : '1px solid currentColor' }}
      />
      {label}
    </span>
  );
}

export function ProjectsBoard() {
  const router = useRouter();
  const { push } = useToast();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setProjects(data.projects ?? []);
      setActiveId(data.activeProjectId ?? null);
    } catch (e) {
      push({ title: 'No se pudieron cargar los proyectos', description: e instanceof Error ? e.message : '', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate(id: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activate: true }),
    });
    if (res.ok) {
      setActiveId(id);
      push({ title: 'Proyecto activo cambiado', variant: 'success' });
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Cada proyecto trae sus canales, sus reglas, su vendedor y sus leads.
          </p>
        </div>
        <Button onClick={() => setCreating((c) => !c)} className="btn-brand">
          <IconPlus className="h-4 w-4" /> Nuevo proyecto
        </Button>
      </header>

      {creating && (
        <Card className="card-glow">
          <CardContent className="pt-6">
            <ProjectForm
              onSaved={() => {
                setCreating(false);
                void load();
              }}
            />
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>}

      {!loading && projects.length === 0 && !creating && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay proyectos. Crea el primero y ya podrás navegar el panel; los canales se
            conectan después.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => (
          <Card key={p.id} className={p.id === activeId ? 'border-[var(--color-primary)]/40 card-glow' : ''}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{p.name}</h2>
                    {p.id === activeId && (
                      <Badge className="gap-1">
                        <IconCheck className="h-3 w-3" /> activo
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {KIND_LABEL[p.kind] ?? p.kind} · <code>{p.slug}</code>
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.id !== activeId && (
                    <Button size="sm" variant="outline" onClick={() => void activate(p.id)}>
                      Usar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                    {editing === p.id ? 'Cerrar' : 'Editar'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {/* Verde solo con id PÚBLICO y token en env: con la página sola
                    no se puede leer un lead, y pintarlo conectado engaña. */}
                <Dot on={p.channelStatus.meta && p.channelStatus.metaToken} label="Meta" detail={p.channelStatus.meta ? (p.channelStatus.metaToken ? 'página + token' : 'página sin token en env') : 'sin página'} />
                <Dot on={p.channelStatus.waba && p.channelStatus.wabaToken} label="WhatsApp" detail={p.channelStatus.waba ? (p.channelStatus.wabaToken ? 'WABA lista' : 'phone id sin token en env') : 'sin WABA'} />
                <Dot on={p.channelStatus.twilio && p.channelStatus.twilioToken} label={`Twilio · ${p.channelStatus.twilioMode}`} detail={p.channelStatus.twilioToken ? 'credenciales en env' : 'sin credenciales en env'} />
                <Dot on={p.channelStatus.mcp > 0} label={`MCP · ${p.channelStatus.mcp}`} detail="fuentes de catálogo y precios" />
                <Dot on={p.channelStatus.email} label="Correo" />
              </div>

              {editing === p.id && (
                <div className="border-t border-[var(--color-border)] pt-4">
                  <ProjectForm
                    initial={{
                      id: p.id,
                      name: p.name,
                      kind: p.kind,
                      sellerPersona: p.sellerPersona ?? '',
                      audience: p.audience ?? '',
                      channels: p.channels ?? {},
                      rules: p.rules ?? {},
                      mcpSources: p.mcpSources ?? [],
                    }}
                    onSaved={() => {
                      setEditing(null);
                      void load();
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
