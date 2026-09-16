'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast-provider';
import type { McpSource, ProjectChannels, ProjectKind, ProjectRules } from '@/src/sales/types';

const KINDS: Array<{ value: ProjectKind; label: string }> = [
  { value: 'real_estate', label: 'Inmobiliario' },
  { value: 'mlm', label: 'Redes / MLM' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'servicios', label: 'Servicios' },
];

export interface ProjectFormValues {
  id?: string;
  name: string;
  kind: ProjectKind;
  sellerPersona: string;
  audience: string;
  channels: ProjectChannels;
  rules: ProjectRules;
  mcpSources: McpSource[];
}

const EMPTY: ProjectFormValues = {
  name: '',
  kind: 'servicios',
  sellerPersona: '',
  audience: '',
  channels: {},
  rules: {},
  mcpSources: [],
};

/** El usuario escribe la URL a medias; `new URL` truena y tumbaría el render. */
function hostOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--color-foreground)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}
    </label>
  );
}

/**
 * Mismo formulario en /onboarding, /projects y /agency. `compact` deja solo lo
 * mínimo para arrancar: ley de Luis, primero se entra y se ve, después se
 * conectan canales.
 */
export function ProjectForm({
  initial,
  compact = false,
  onSaved,
}: {
  initial?: Partial<ProjectFormValues>;
  compact?: boolean;
  onSaved?: (projectId: string) => void;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [v, setV] = useState<ProjectFormValues>({ ...EMPTY, ...initial });
  const [showChannels, setShowChannels] = useState(!compact);
  const [saving, setSaving] = useState(false);

  const setChannel = (k: keyof ProjectChannels, value: string) =>
    setV((s) => ({ ...s, channels: { ...s.channels, [k]: value } }));
  const setRule = (k: keyof ProjectRules, value: unknown) =>
    setV((s) => ({ ...s, rules: { ...s.rules, [k]: value } }));

  async function save() {
    if (saving) return;
    if (v.name.trim().length < 2) {
      push({ title: 'Falta el nombre del proyecto', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: v.name.trim(),
        kind: v.kind,
        sellerPersona: v.sellerPersona.trim() || null,
        audience: v.audience.trim() || null,
        channels: {
          ...v.channels,
          meta_form_ids: Array.isArray(v.channels.meta_form_ids)
            ? v.channels.meta_form_ids
            : String(v.channels.meta_form_ids ?? '')
                .split(/[,\s]+/)
                .filter(Boolean),
        },
        rules: v.rules,
        mcpSources: v.mcpSources,
        ...(v.id ? { activate: true } : {}),
      };
      const res = await fetch(v.id ? `/api/projects/${v.id}` : '/api/projects', {
        method: v.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar.');
      push({ title: v.id ? 'Proyecto actualizado' : 'Proyecto creado', variant: 'success' });
      router.refresh();
      onSaved?.(data.project.id);
    } catch (e) {
      push({ title: 'No se guardó', description: e instanceof Error ? e.message : 'error', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const formIdsText = Array.isArray(v.channels.meta_form_ids)
    ? v.channels.meta_form_ids.join(', ')
    : String(v.channels.meta_form_ids ?? '');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del proyecto">
          <Input value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="V&LIVING" />
        </Field>
        <Field label="Tipo">
          <select
            value={v.kind}
            onChange={(e) => setV((s) => ({ ...s, kind: e.target.value as ProjectKind }))}
            className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Persona del vendedor" hint="Cómo habla y qué busca en cada conversación. Es el sistema del agente.">
        <Textarea
          rows={3}
          value={v.sellerPersona}
          onChange={(e) => setV((s) => ({ ...s, sellerPersona: e.target.value }))}
          placeholder="Eres el asesor de… hablas claro y directo, tu meta es agendar una visita."
        />
      </Field>

      {!compact && (
        <Field label="Audiencia">
          <Input
            value={v.audience}
            onChange={(e) => setV((s) => ({ ...s, audience: e.target.value }))}
            placeholder="Inversionistas 35-55, México y EE. UU."
          />
        </Field>
      )}

      {compact && !showChannels && (
        <button
          type="button"
          onClick={() => setShowChannels(true)}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          Conectar canales ahora (opcional)
        </button>
      )}

      {showChannels && (
        <div className="space-y-4 rounded-xl border border-[var(--color-border)] p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Canales
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
              Aquí solo van IDs públicos. Los tokens se cargan como variables de entorno en Vercel
              (<code>WHATSAPP_TOKEN_&lt;SLUG&gt;</code>, <code>META_PAGE_TOKEN_&lt;SLUG&gt;</code>), nunca en la base.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Meta · page id">
              <Input value={v.channels.meta_page_id ?? ''} onChange={(e) => setChannel('meta_page_id', e.target.value)} placeholder="1173019489236259" />
            </Field>
            <Field label="Meta · form ids" hint="Separados por coma.">
              <Input
                value={formIdsText}
                onChange={(e) =>
                  setV((s) => ({
                    ...s,
                    channels: { ...s.channels, meta_form_ids: e.target.value.split(/[,\s]+/).filter(Boolean) },
                  }))
                }
                placeholder="2146578942620117"
              />
            </Field>
            <Field label="Meta · cuenta publicitaria">
              <Input value={v.channels.meta_ad_account ?? ''} onChange={(e) => setChannel('meta_ad_account', e.target.value)} placeholder="act_1719141675826755" />
            </Field>
            <Field label="WhatsApp · phone number id (WABA)">
              <Input value={v.channels.waba_phone_id ?? ''} onChange={(e) => setChannel('waba_phone_id', e.target.value)} placeholder="1234567890" />
            </Field>
            <Field label="Twilio · número">
              <Input value={v.channels.twilio_number ?? ''} onChange={(e) => setChannel('twilio_number', e.target.value)} placeholder="+1..." />
            </Field>
            <Field label="Correo de salida">
              <Input value={v.channels.from_email ?? ''} onChange={(e) => setChannel('from_email', e.target.value)} placeholder="ventas@dominio.com" />
            </Field>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Reglas</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sin contacto (horas)">
              <Input type="number" min={0} value={v.rules.no_contact_hours ?? 2} onChange={(e) => setRule('no_contact_hours', Number(e.target.value))} />
            </Field>
            <Field label="Sin respuesta · SMS (horas)">
              <Input type="number" min={0} value={v.rules.no_reply_sms_hours ?? 72} onChange={(e) => setRule('no_reply_sms_hours', Number(e.target.value))} />
            </Field>
            <Field label="Sin respuesta · retarget (horas)">
              <Input type="number" min={0} value={v.rules.no_reply_retarget_hours ?? 168} onChange={(e) => setRule('no_reply_retarget_hours', Number(e.target.value))} />
            </Field>
            <Field label="Avisar al dueño desde grado">
              <select
                value={v.rules.notify_owner_grade ?? 'A'}
                onChange={(e) => setRule('notify_owner_grade', e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Field>
            <Field label="Teléfono del dueño" hint="A donde llegan los avisos por SMS.">
              <Input value={v.rules.owner_phone ?? ''} onChange={(e) => setRule('owner_phone', e.target.value)} placeholder="+521..." />
            </Field>
            <Field label="Twilio" hint="En trial solo salen SMS a números verificados.">
              <select
                value={v.rules.twilio_mode ?? 'trial'}
                onChange={(e) => setRule('twilio_mode', e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="trial">trial</option>
                <option value="paid">paid</option>
              </select>
            </Field>
            <Field label="Plantilla de primer contacto" hint="Nombre de la plantilla aprobada en WhatsApp.">
              <Input value={v.rules.first_contact_template ?? ''} onChange={(e) => setRule('first_contact_template', e.target.value)} placeholder="primer_contacto_es" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={v.rules.auto_reply ?? false} onChange={(e) => setRule('auto_reply', e.target.checked)} />
              El vendedor responde solo (si está apagado, propone y tú apruebas)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={v.rules.auto_first_contact ?? false} onChange={(e) => setRule('auto_first_contact', e.target.checked)} />
              Primer contacto automático
            </label>
          </div>

          <Field label="Fuentes MCP" hint="Una URL por línea. De aquí saca el vendedor catálogo y precios reales.">
            <Textarea
              rows={2}
              value={v.mcpSources.map((m) => m.url).join('\n')}
              onChange={(e) =>
                setV((s) => ({
                  ...s,
                  mcpSources: e.target.value
                    .split('\n')
                    .map((u) => u.trim())
                    .filter(Boolean)
                    .map((url) => ({ label: hostOf(url), url })),
                }))
              }
              placeholder="https://mcp.vliving.site/mcp"
            />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={save} disabled={saving} className="btn-brand">
          {saving ? 'Guardando…' : v.id ? 'Guardar cambios' : 'Crear proyecto'}
        </Button>
      </div>
    </div>
  );
}
