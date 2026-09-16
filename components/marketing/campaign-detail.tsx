'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';
import { IconTrash } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUSES,
  type CampaignStatus,
  type CampaignSummary,
} from '@/src/marketing/types';
import { CHANNEL_SPECS } from '@/src/projects/types';
import { LEAD_STAGE_LABEL_ONE, type LeadStage } from '@/src/sales/types';
import { CampaignStatusPill, formatBudget, formatWindow } from './campaign-bits';

export interface CampaignLeadRow {
  id: string;
  nombre: string | null;
  telefono: string | null;
  etapa: LeadStage;
  grado: string;
  puntaje: number;
  creado: string;
}

/**
 * El detalle de UNA campaña: qué es, qué trajo y cómo se apaga.
 *
 * Lo único que se puede cambiar desde aquí es el estado. Prender, pausar y dar
 * por terminada una campaña es lo que se hace todos los días; reescribirle el
 * nombre y el presupuesto es raro y pediría un formulario entero que hoy nadie
 * necesita. El día que se pida, la API ya acepta el PATCH completo.
 */
export function CampaignDetail({
  projectId,
  campana: inicial,
  leads,
  nombresDeFormulario,
  puedeEditar,
  puedeBorrar,
}: {
  projectId: string;
  campana: CampaignSummary;
  leads: CampaignLeadRow[];
  /** id del formulario de Meta → el nombre que le puso el cliente. */
  nombresDeFormulario: Record<string, string>;
  puedeEditar: boolean;
  puedeBorrar: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [campana, setCampana] = useState(inicial);
  const [trabajando, setTrabajando] = useState(false);

  async function cambiarEstado(status: CampaignStatus) {
    if (trabajando || status === campana.status) return;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/campanas/${campana.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        push({ title: data?.error ?? 'No se pudo cambiar el estado', variant: 'error' });
        return;
      }
      // Los conteos no viajan en el PATCH: se conservan los que ya se midieron
      // en el servidor en vez de pintar ceros que no son verdad.
      setCampana((c) => ({ ...data.campana, leads: c.leads, sinContactar: c.sinContactar }));
      push({ title: `Campaña ${CAMPAIGN_STATUS_LABEL[status].toLowerCase()}`, variant: 'success' });
    } catch {
      push({ title: 'No se pudo cambiar el estado', variant: 'error' });
    } finally {
      setTrabajando(false);
    }
  }

  async function borrar() {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/campanas/${campana.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        push({ title: 'No se pudo borrar la campaña', variant: 'error' });
        return;
      }
      push({ title: 'Campaña borrada. Sus leads siguen en el proyecto.', variant: 'success' });
      router.push(`/projects/${projectId}/campanas`);
      router.refresh();
    } catch {
      push({ title: 'No se pudo borrar la campaña', variant: 'error' });
    } finally {
      setTrabajando(false);
    }
  }

  const ventana = formatWindow(campana.startsAt, campana.endsAt);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-4">
          <Dato titulo="Estado">
            <CampaignStatusPill status={campana.status} />
          </Dato>
          <Dato titulo="Objetivo">{CAMPAIGN_OBJECTIVE_LABEL[campana.objective]}</Dato>
          <Dato titulo="Presupuesto">
            {campana.budget === null ? 'Sin definir' : formatBudget(campana.budget)}
          </Dato>
          <Dato titulo="Fechas">{ventana ?? 'Sin fechas'}</Dato>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero valor={campana.leads} etiqueta={campana.leads === 1 ? 'lead atribuido' : 'leads atribuidos'} />
        <Numero valor={campana.sinContactar} etiqueta="sin contactar" />
        <Numero valor={campana.channels.length} etiqueta={campana.channels.length === 1 ? 'canal' : 'canales'} />
      </div>

      {campana.channels.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Dónde corre</h2>
          <div className="flex flex-wrap gap-1.5">
            {campana.channels.map((ch) => (
              <span
                key={ch}
                className="rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]"
              >
                {CHANNEL_SPECS.find((s) => s.id === ch)?.label ?? ch}
              </span>
            ))}
          </div>
        </section>
      )}

      {(campana.metaRefs.form_ids?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Formularios de Facebook de esta campaña</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Los leads que entren por {campana.metaRefs.form_ids!.length === 1 ? 'este formulario' : 'estos formularios'} se
            cuentan aquí solos.
          </p>
          <ul className="space-y-1">
            {campana.metaRefs.form_ids!.map((f) => (
              <li
                key={f}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
              >
                {/*
                  El NOMBRE que el cliente le puso en Facebook. El identificador
                  crudo (2146578942620117) solo sale si el formulario ya no está
                  en la página conectada — ahí decir el número es más honesto que
                  inventarle un nombre.
                */}
                {nombresDeFormulario[f] ?? `Formulario ${f}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {puedeEditar && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Prender, pausar o cerrar</h2>
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={trabajando}
                onClick={() => cambiarEstado(s)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50',
                  campana.status === s
                    ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/60',
                )}
              >
                {CAMPAIGN_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Los leads que trajo</h2>
        <Card>
          <CardContent className="p-0">
            {leads.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                Todavía no ha entrado ninguno por esta campaña.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.nombre ?? 'Sin nombre'}</p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">
                        {l.telefono ?? 'sin teléfono'} · grado {l.grado} ({l.puntaje})
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                      {LEAD_STAGE_LABEL_ONE[l.etapa]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {puedeBorrar && (
        <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
          <Button variant="ghost" onClick={borrar} disabled={trabajando} className="text-[var(--color-destructive)]">
            <IconTrash className="h-4 w-4" />
            Borrar esta campaña
          </Button>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Los {campana.leads} {campana.leads === 1 ? 'lead' : 'leads'} que trajo se quedan en el
            proyecto, sin campaña. Lo que se borra es la pauta, no la gente.
          </p>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {titulo}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Numero({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-3xl font-semibold leading-none">{valor}</p>
        <p className="pt-1 text-xs text-[var(--color-muted-foreground)]">{etiqueta}</p>
      </CardContent>
    </Card>
  );
}
