'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast-provider';
import { IconCheck } from '@/components/icons';
import { cn } from '@/lib/utils';
import { PROJECT_KIND_LABEL, PROJECT_KINDS, type ProjectKind } from '@/src/sales/types';
import { ConnectionsBoard } from './connections-board';

/**
 * Alta de proyecto en tres pasos: QUÉ ES · CÓMO VENDE · CONEXIONES.
 *
 * El proyecto se crea DE VERDAD al terminar el paso 1, no al final. Dos razones:
 * el issue pide poder guardar en cualquier paso, y el paso 3 conecta canales —
 * que necesitan un proyecto al que colgarse. Quien cierra la pestaña a la mitad
 * se encuentra su proyecto hecho, no el formulario en blanco otra vez.
 */

const PASOS = [
  { n: 1, titulo: 'Qué es', ayuda: 'El negocio y dónde está.' },
  { n: 2, titulo: 'Cómo vende', ayuda: 'Tu vendedor: cómo habla y hasta dónde llega.' },
  { n: 3, titulo: 'Conexiones', ayuda: 'Por dónde entran y salen los mensajes.' },
] as const;

const IDIOMAS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
];

export function NewProjectWizard() {
  const router = useRouter();
  const { push } = useToast();
  const [paso, setPaso] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // paso 1
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('real_estate');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('México');
  const [brandLanguage, setBrandLanguage] = useState('es');

  // paso 2
  const [sellerName, setSellerName] = useState('');
  const [sellerTone, setSellerTone] = useState('');
  const [neverPromises, setNeverPromises] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [escalateTo, setEscalateTo] = useState('');

  async function guardarPaso1(seguir: boolean) {
    if (name.trim().length < 2) {
      push({ title: 'Ponle un nombre al proyecto', variant: 'error' });
      return;
    }
    setGuardando(true);
    try {
      const payload = { name: name.trim(), kind, website, city, country, brandLanguage };
      const res = await fetch(projectId ? `/api/projects/${projectId}` : '/api/projects', {
        method: projectId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar.');
      setProjectId(data.project.id);
      push({ title: 'Proyecto guardado', variant: 'success' });
      if (seguir) setPaso(2);
      else router.push(`/projects/${data.project.id}`);
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPaso2(seguir: boolean) {
    if (!projectId) return;
    setGuardando(true);
    try {
      const persona = [
        sellerName.trim() ? `Te llamas ${sellerName.trim()}.` : '',
        sellerTone.trim() ? `Hablas ${sellerTone.trim()}.` : '',
        `Vendes para ${name.trim()}.`,
        neverPromises.trim() ? `Nunca prometes: ${neverPromises.trim()}.` : '',
        businessHours.trim() ? `Atiendes ${businessHours.trim()}.` : '',
        escalateTo.trim() ? `Cuando algo te rebasa, se lo pasas a ${escalateTo.trim()}.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerPersona: persona,
          rules: {
            seller_tone: sellerTone,
            never_promises: neverPromises,
            business_hours: businessHours,
            escalate_to: escalateTo,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar.');
      push({ title: 'Tu vendedor quedó definido', variant: 'success' });
      if (seguir) setPaso(3);
      else router.push(`/projects/${projectId}`);
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Nuevo proyecto</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Tres pasos. Puedes guardar y seguir después en cualquiera de ellos.
        </p>
      </header>

      <ol className="flex items-center gap-2">
        {PASOS.map((p) => {
          const hecho = p.n < paso;
          const actual = p.n === paso;
          return (
            <li key={p.n} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  hecho && 'bg-[var(--color-success)]/20 text-[var(--color-success)]',
                  actual && 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
                  !hecho && !actual && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                )}
              >
                {hecho ? <IconCheck className="h-3.5 w-3.5" /> : p.n}
              </span>
              <span
                className={cn(
                  'min-w-0 truncate text-xs',
                  actual ? 'font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]',
                )}
              >
                {p.titulo}
              </span>
            </li>
          );
        })}
      </ol>

      <Card className="card-glow">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-medium">{PASOS[paso - 1].titulo}</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">{PASOS[paso - 1].ayuda}</p>
          </div>

          {paso === 1 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nombre del proyecto">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="V&LIVING" />
                </Campo>
                <Campo label="Tipo de negocio">
                  <Select value={kind} onChange={(v) => setKind(v as ProjectKind)}>
                    {PROJECT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PROJECT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Sitio web" ayuda="Opcional.">
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="vliving.site" />
                </Campo>
                <Campo label="Ciudad">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tulum" />
                </Campo>
                <Campo label="País">
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="México" />
                </Campo>
                <Campo label="Idioma">
                  <Select value={brandLanguage} onChange={setBrandLanguage}>
                    {IDIOMAS.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
              <Botones
                guardando={guardando}
                onGuardar={() => void guardarPaso1(false)}
                onSeguir={() => void guardarPaso1(true)}
              />
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Cómo se llama tu vendedor">
                  <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Sofía" />
                </Campo>
                <Campo label="Cómo habla">
                  <Input
                    value={sellerTone}
                    onChange={(e) => setSellerTone(e.target.value)}
                    placeholder="claro y directo, de tú"
                  />
                </Campo>
              </div>
              <Campo label="Qué NO promete" ayuda="Esto es una prohibición dura: no lo va a decir aunque se lo pidan.">
                <Textarea
                  rows={2}
                  value={neverPromises}
                  onChange={(e) => setNeverPromises(e.target.value)}
                  placeholder="descuentos, fechas de entrega, rendimientos garantizados"
                />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Horario de atención">
                  <Input
                    value={businessHours}
                    onChange={(e) => setBusinessHours(e.target.value)}
                    placeholder="lunes a viernes de 9 a 19, sábado de 10 a 14"
                  />
                </Campo>
                <Campo label="A quién le pasa la bola" ayuda="Nombre y teléfono o correo.">
                  <Input
                    value={escalateTo}
                    onChange={(e) => setEscalateTo(e.target.value)}
                    placeholder="Luis · +52 1 998 000 0000"
                  />
                </Campo>
              </div>
              <Botones
                guardando={guardando}
                onGuardar={() => void guardarPaso2(false)}
                onSeguir={() => void guardarPaso2(true)}
                onAtras={() => setPaso(1)}
              />
            </div>
          )}

          {paso === 3 && projectId && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Conecta lo que tengas a la mano. Lo que falte lo puedes conectar después desde
                Conexiones, y también puedes pedirle a alguien más que lo conecte por ti.
              </p>
              <ConnectionsBoard projectId={projectId} compact />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setPaso(2)}>
                  Atrás
                </Button>
                <Button className="btn-brand" onClick={() => router.push(`/projects/${projectId}`)}>
                  Entrar al proyecto
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
    >
      {children}
    </select>
  );
}

function Botones({
  guardando,
  onGuardar,
  onSeguir,
  onAtras,
}: {
  guardando: boolean;
  onGuardar: () => void;
  onSeguir: () => void;
  onAtras?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
      {onAtras && (
        <Button variant="ghost" onClick={onAtras} disabled={guardando}>
          Atrás
        </Button>
      )}
      <Button variant="outline" onClick={onGuardar} disabled={guardando}>
        Guardar y salir
      </Button>
      <Button className="btn-brand" onClick={onSeguir} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar y seguir'}
      </Button>
    </div>
  );
}
