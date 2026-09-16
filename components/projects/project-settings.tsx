'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast-provider';
import { PROJECT_KIND_LABEL, PROJECT_KINDS, type ProjectKind, type ProjectRules } from '@/src/sales/types';

/**
 * Ajustes del proyecto: lo mismo que pide el alta, editable para siempre.
 *
 * Es un solo formulario y no tres pestañas porque es lo que Luis va a abrir
 * cuando algo esté mal — y en ese momento no quiere buscar en qué pestaña vivía
 * el horario de atención.
 */
export interface SettingsValues {
  name: string;
  kind: ProjectKind;
  website: string;
  city: string;
  country: string;
  sellerPersona: string;
  audience: string;
  rules: ProjectRules;
}

export function ProjectSettings({
  projectId,
  initial,
  editable,
}: {
  projectId: string;
  initial: SettingsValues;
  editable: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [v, setV] = useState<SettingsValues>(initial);
  const [guardando, setGuardando] = useState(false);

  const set = <K extends keyof SettingsValues>(k: K, value: SettingsValues[K]) =>
    setV((s) => ({ ...s, [k]: value }));
  const setRule = <K extends keyof ProjectRules>(k: K, value: ProjectRules[K]) =>
    setV((s) => ({ ...s, rules: { ...s.rules, [k]: value } }));

  async function guardar() {
    if (guardando) return;
    if (v.name.trim().length < 2) {
      push({ title: 'El proyecto necesita un nombre', variant: 'error' });
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, name: v.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar.');
      push({ title: 'Ajustes guardados', variant: 'success' });
      router.refresh();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  const ro = !editable;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <h2 className="font-medium">El negocio</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre del proyecto">
              <Input disabled={ro} value={v.name} onChange={(e) => set('name', e.target.value)} />
            </Campo>
            <Campo label="Tipo de negocio">
              <select
                disabled={ro}
                value={v.kind}
                onChange={(e) => set('kind', e.target.value as ProjectKind)}
                className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm shadow-sm disabled:opacity-60"
              >
                {PROJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PROJECT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Sitio web">
              <Input disabled={ro} value={v.website} onChange={(e) => set('website', e.target.value)} placeholder="vliving.site" />
            </Campo>
            <Campo label="A quién le vendes">
              <Input
                disabled={ro}
                value={v.audience}
                onChange={(e) => set('audience', e.target.value)}
                placeholder="Inversionistas de 35 a 55, México y Estados Unidos"
              />
            </Campo>
            <Campo label="Ciudad">
              <Input disabled={ro} value={v.city} onChange={(e) => set('city', e.target.value)} />
            </Campo>
            <Campo label="País">
              <Input disabled={ro} value={v.country} onChange={(e) => set('country', e.target.value)} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <h2 className="font-medium">Tu vendedor</h2>
          <Campo label="Cómo habla y qué busca" ayuda="Es la instrucción que sigue en cada conversación.">
            <Textarea
              disabled={ro}
              rows={4}
              value={v.sellerPersona}
              onChange={(e) => set('sellerPersona', e.target.value)}
              placeholder="Te llamas Sofía. Hablas claro y directo, de tú. Tu meta es agendar una visita."
            />
          </Campo>
          <Campo label="Qué NO promete" ayuda="Prohibición dura: no lo va a decir aunque se lo pidan.">
            <Textarea
              disabled={ro}
              rows={2}
              value={v.rules.never_promises ?? ''}
              onChange={(e) => setRule('never_promises', e.target.value)}
              placeholder="descuentos, fechas de entrega, rendimientos garantizados"
            />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Horario de atención">
              <Input
                disabled={ro}
                value={v.rules.business_hours ?? ''}
                onChange={(e) => setRule('business_hours', e.target.value)}
                placeholder="lunes a viernes de 9 a 19"
              />
            </Campo>
            <Campo label="A quién le pasa la bola">
              <Input
                disabled={ro}
                value={v.rules.escalate_to ?? ''}
                onChange={(e) => setRule('escalate_to', e.target.value)}
                placeholder="Luis · +52 1 998 000 0000"
              />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              disabled={ro}
              checked={v.rules.auto_reply ?? false}
              onChange={(e) => setRule('auto_reply', e.target.checked)}
            />
            Que conteste solo. Si lo dejas apagado, te propone la respuesta y tú apruebas.
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <h2 className="font-medium">Cuándo te avisa</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Sin contactar (horas)">
              <Input
                disabled={ro}
                type="number"
                min={0}
                value={v.rules.no_contact_hours ?? 2}
                onChange={(e) => setRule('no_contact_hours', Number(e.target.value))}
              />
            </Campo>
            <Campo label="Sin respuesta (horas)">
              <Input
                disabled={ro}
                type="number"
                min={0}
                value={v.rules.no_reply_sms_hours ?? 72}
                onChange={(e) => setRule('no_reply_sms_hours', Number(e.target.value))}
              />
            </Campo>
            <Campo label="Tu teléfono" ayuda="A donde llegan los avisos.">
              <Input
                disabled={ro}
                value={v.rules.owner_phone ?? ''}
                onChange={(e) => setRule('owner_phone', e.target.value)}
                placeholder="+52 1 998 000 0000"
              />
            </Campo>
          </div>
        </CardContent>
      </Card>

      {editable && (
        <div className="flex justify-end">
          <Button className="btn-brand" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Campo({
  label,
  ayuda,
  children,
}: {
  label: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--color-foreground)]">{label}</span>
      {children}
      {ayuda && <span className="block text-[11px] text-[var(--color-muted-foreground)]">{ayuda}</span>}
    </label>
  );
}
