'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconArrowRight, IconPlus, IconTarget } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_OBJECTIVE_HELP,
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS_LABEL,
  type CampaignObjective,
  type CampaignStatus,
  type CampaignSummary,
} from '@/src/marketing/types';
import { CONNECTORS, type ConnectionChannel } from '@/src/projects/types';
import { CampaignStatusPill, formatBudget, formatWindow } from './campaign-bits';

/**
 * Las campañas de UN proyecto.
 *
 * "Nueva campaña" vive aquí y en ningún otro lado. En el menú lateral el botón
 * es "Nuevo proyecto": son dos niveles distintos y confundirlos es lo que hizo
 * que durante tres corridas "campaña" significara dos cosas a la vez.
 */

interface FormularioMeta {
  id: string;
  name: string;
  leadsCount?: number;
}

export function CampaignsBoard({
  projectId,
  canalesConectados,
  formulariosMeta,
}: {
  projectId: string;
  canalesConectados: ConnectionChannel[];
  formulariosMeta: FormularioMeta[];
}) {
  const { push } = useToast();
  const [campanas, setCampanas] = useState<CampaignSummary[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/campanas`, { cache: 'no-store' });
      const data = await res.json();
      setCampanas(data.campanas ?? []);
      setPuedeEditar(Boolean(data.puedeEditar));
    } catch {
      push({ title: 'No se pudieron cargar las campañas', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, push]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tus campañas</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {campanas.length === 0
              ? 'Todavía no tienes ninguna.'
              : `${campanas.length} ${campanas.length === 1 ? 'campaña' : 'campañas'} en este proyecto.`}
          </p>
        </div>
        {puedeEditar && (
          <Button className="btn-brand" onClick={() => setAbierto((v) => !v)}>
            <IconPlus className="h-4 w-4" />
            Nueva campaña
          </Button>
        )}
      </div>

      {abierto && puedeEditar && (
        <NuevaCampana
          projectId={projectId}
          canalesConectados={canalesConectados}
          formulariosMeta={formulariosMeta}
          onListo={() => {
            setAbierto(false);
            void cargar();
          }}
          onCancelar={() => setAbierto(false)}
        />
      )}

      {campanas.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Una campaña es una pauta concreta: un nombre, un objetivo y los canales donde corre.
              Cada lead que entre queda amarrado a la suya, y así sabes cuál te está trayendo gente.
            </p>
            {!puedeEditar && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Tu rol en este proyecto no da de alta campañas.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {campanas.map((c) => (
            <TarjetaCampana key={c.id} projectId={projectId} campana={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TarjetaCampana({
  projectId,
  campana,
}: {
  projectId: string;
  campana: CampaignSummary;
}) {
  const ventana = formatWindow(campana.startsAt, campana.endsAt);
  return (
    <Link
      href={`/projects/${projectId}/campanas/${campana.id}`}
      className="card-glow group flex flex-col gap-3 rounded-xl p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{campana.name}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {CAMPAIGN_OBJECTIVE_LABEL[campana.objective]}
          </p>
        </div>
        <CampaignStatusPill status={campana.status} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold leading-none">{campana.leads}</p>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {campana.leads === 1 ? 'lead atribuido' : 'leads atribuidos'}
            {campana.sinContactar > 0 && ` · ${campana.sinContactar} sin contactar`}
          </p>
        </div>
        <IconArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {campana.channels.map((ch) => (
          <span key={ch} className="rounded-md bg-[var(--color-muted)] px-1.5 py-0.5">
            {CONNECTORS.find((s) => s.slug === ch)?.label ?? ch}
          </span>
        ))}
        {campana.budget !== null && <span>{formatBudget(campana.budget)}</span>}
        {ventana && <span>{ventana}</span>}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------

function NuevaCampana({
  projectId,
  canalesConectados,
  formulariosMeta,
  onListo,
  onCancelar,
}: {
  projectId: string;
  canalesConectados: ConnectionChannel[];
  formulariosMeta: FormularioMeta[];
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { push } = useToast();
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState<CampaignObjective>('leads');
  const [estado, setEstado] = useState<CampaignStatus>('borrador');
  const [canales, setCanales] = useState<ConnectionChannel[]>(
    canalesConectados.includes('meta') ? ['meta'] : [],
  );
  const [presupuesto, setPresupuesto] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [formularios, setFormularios] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
  }

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/campanas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          objective: objetivo,
          status: estado,
          channels: canales,
          budget: presupuesto === '' ? null : presupuesto,
          startsAt: inicio || null,
          endsAt: fin || null,
          metaRefs: formularios.length > 0 ? { form_ids: formularios } : {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        push({ title: data?.error ?? 'No se pudo crear la campaña', variant: 'error' });
        return;
      }
      push({ title: `Campaña "${data.campana.name}" creada`, variant: 'success' });
      onListo();
    } catch {
      push({ title: 'No se pudo crear la campaña', variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="card-premium">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="campana-nombre">
            Nombre de la campaña
          </label>
          <Input
            id="campana-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Preventa Tulum — septiembre"
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium">¿Para qué la prendes?</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CAMPAIGN_OBJECTIVES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setObjetivo(o)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                  objetivo === o
                    ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/60',
                )}
              >
                <span className="block font-medium">{CAMPAIGN_OBJECTIVE_LABEL[o]}</span>
                <span className="block text-[var(--color-muted-foreground)]">
                  {CAMPAIGN_OBJECTIVE_HELP[o]}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium">¿Dónde corre?</legend>
          <div className="flex flex-wrap gap-1.5">
            {CONNECTORS.map((spec) => {
              const elegido = canales.includes(spec.slug);
              const conectado = canalesConectados.includes(spec.slug);
              return (
                <button
                  key={spec.slug}
                  type="button"
                  onClick={() => setCanales((c) => alternar(c, spec.slug))}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                    elegido
                      ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/60',
                  )}
                >
                  {spec.label}
                  {!conectado && (
                    <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">
                      sin conectar
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {formulariosMeta.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">
              ¿Qué formularios de Facebook son de esta campaña?
            </legend>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              De aquí sale la atribución: los leads que lleguen por estos formularios se van a
              contar en esta campaña.
            </p>
            <div className="space-y-1">
              {formulariosMeta.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={formularios.includes(f.id)}
                    onChange={() => setFormularios((v) => alternar(v, f.id))}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {typeof f.leadsCount === 'number' && (
                    <span className="shrink-0 text-[var(--color-muted-foreground)]">
                      {f.leadsCount} en Facebook
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="campana-presupuesto">
              Presupuesto (MXN)
            </label>
            <Input
              id="campana-presupuesto"
              inputMode="decimal"
              value={presupuesto}
              onChange={(e) => setPresupuesto(e.target.value)}
              placeholder="15000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="campana-inicio">
              Empieza
            </label>
            <Input
              id="campana-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="campana-fin">
              Termina
            </label>
            <Input
              id="campana-fin"
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium">¿Cómo nace?</legend>
          <div className="flex gap-1.5">
            {(['borrador', 'activa'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEstado(s)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  estado === s
                    ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/60',
                )}
              >
                {CAMPAIGN_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2 pt-1">
          <Button className="btn-brand" onClick={guardar} disabled={guardando || nombre.trim().length < 2}>
            <IconTarget className="h-4 w-4" />
            {guardando ? 'Creando…' : 'Crear campaña'}
          </Button>
          <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
