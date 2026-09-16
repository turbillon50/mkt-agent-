'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';

/**
 * La bandeja del proyecto: Messenger, DMs de Instagram, WhatsApp, SMS y correo
 * en UNA lista, con la respuesta ahí mismo.
 *
 * Hasta la corrida 12 esta pantalla solo leía `whatsapp / sms / email` y por eso
 * la QA la marcó en rojo: el cliente tenía 8 conversaciones vivas en Instagram y
 * un hilo en Messenger que Goossip no enseñaba. Ahora entran todos.
 *
 * Dos decisiones de pantalla que no son estéticas:
 *
 *   · **"Proponer respuesta" llama al vendedor y NO manda nada.** El texto cae
 *     en la caja para que un humano lo lea antes. Un agente que contesta solo en
 *     el Instagram de un cliente es justo lo que nadie pidió.
 *   · **Los hilos que no se pueden contestar se dicen**, no se esconden. Un
 *     hilo de correo o de WhatsApp aparece con su etiqueta y sin caja de texto:
 *     esconderlo haría creer que no hay nada ahí.
 */

interface Hilo {
  id: string;
  canal: 'whatsapp' | 'sms' | 'email' | 'messenger' | 'instagram';
  estado: 'open' | 'escalated' | 'closed';
  quien: string;
  lead: { id: string; nombre: string | null; telefono: string | null; grado: string } | null;
  ultimoTexto: string | null;
  ultimoAt: string | null;
  ultimoEntrante: boolean;
  sinLeer: number;
  respondible: boolean;
  ventanaAbierta: boolean;
}

interface Mensaje {
  id: string;
  texto: string;
  entrante: boolean;
  cuando: string;
  quien: string | null;
}

const CANAL: Record<Hilo['canal'], { label: string; clase: string }> = {
  messenger: { label: 'Messenger', clase: 'bg-[#0084ff]/15 text-[#0084ff]' },
  instagram: { label: 'Instagram', clase: 'bg-[#e1306c]/15 text-[#e1306c]' },
  whatsapp: { label: 'WhatsApp', clase: 'bg-[#25d366]/15 text-[#128c3e]' },
  sms: { label: 'SMS', clase: 'bg-[var(--color-accent)] text-[var(--color-primary)]' },
  email: { label: 'Correo', clase: 'bg-[var(--color-accent)] text-[var(--color-primary)]' },
};

const ESTADO: Record<Hilo['estado'], string> = {
  open: 'Abierta',
  escalated: 'Te necesita',
  closed: 'Cerrada',
};

function cuando(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 60 * 24) return `hace ${Math.round(mins / 60)} h`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function BandejaSocial({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const [hilos, setHilos] = useState<Hilo[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [puedeResponder, setPuedeResponder] = useState(false);

  const cargar = useCallback(
    async (sync = false) => {
      try {
        const r = await fetch(`/api/projects/${projectId}/conversaciones${sync ? '?sync=1' : ''}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        setHilos(j.hilos ?? []);
        setPuedeResponder(Boolean(j.puedeResponder));
      } finally {
        setCargando(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void cargar();
    // La bandeja se refresca sola cada 2 min, igual que el cron que la llena.
    // Sin esto, quien la deja abierta en una pestaña ve datos de hace una hora.
    const t = setInterval(() => void cargar(), 120_000);
    return () => clearInterval(t);
  }, [cargar]);

  const abrir = useCallback(
    async (id: string) => {
      setAbierto(id);
      setTexto('');
      setMensajes([]);
      const r = await fetch(`/api/projects/${projectId}/conversaciones/${id}`, { cache: 'no-store' });
      const j = await r.json();
      setMensajes(j.mensajes ?? []);
      // Abrir un hilo ES haberlo leído.
      void fetch(`/api/projects/${projectId}/conversaciones/${id}`, { method: 'PATCH' })
        .then(() => setHilos((prev) => prev.map((h) => (h.id === id ? { ...h, sinLeer: 0 } : h))))
        .catch(() => undefined);
    },
    [projectId],
  );

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/conversaciones`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) {
        push({ title: j.error ?? 'No se pudo sincronizar.', variant: 'error' });
      } else {
        const caidos = (j.canales ?? []).filter((c: { error?: string }) => c.error);
        push({
          title: `${j.hilos} hilos · ${j.mensajesNuevos} mensajes nuevos`,
          description: caidos.length
            ? caidos.map((c: { canal: string; error: string }) => `${c.canal}: ${c.error}`).join(' · ')
            : undefined,
          variant: caidos.length ? 'error' : 'success',
        });
      }
      await cargar();
    } finally {
      setSincronizando(false);
    }
  }, [projectId, cargar, push]);

  const proponer = useCallback(async () => {
    if (!abierto) return;
    setTrabajando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/conversaciones/${abierto}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'proponer' }),
      });
      const j = await r.json();
      if (!r.ok) {
        push({ title: j.error ?? 'No se pudo redactar.', variant: 'error' });
        return;
      }
      setTexto(j.propuesta ?? '');
      if (j.escala) {
        push({
          title: 'Ojo: esto pide un humano',
          description: j.motivo_escalacion ?? 'El vendedor detectó señal de compra.',
          variant: 'info',
        });
      }
    } finally {
      setTrabajando(false);
    }
  }, [abierto, projectId, push]);

  const mandar = useCallback(async () => {
    if (!abierto || !texto.trim()) return;
    setTrabajando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/conversaciones/${abierto}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'responder', texto }),
      });
      const j = await r.json();
      if (!r.ok) {
        push({ title: j.error ?? 'No se pudo mandar.', variant: 'error' });
        return;
      }
      push({ title: 'Mandado.', variant: 'success' });
      setTexto('');
      await abrir(abierto);
      await cargar();
    } finally {
      setTrabajando(false);
    }
  }, [abierto, texto, projectId, abrir, cargar, push]);

  const hilo = hilos.find((h) => h.id === abierto) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {cargando
            ? 'Cargando…'
            : `${hilos.length} ${hilos.length === 1 ? 'hilo' : 'hilos'} · se actualiza solo cada 2 min`}
        </p>
        <Button variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? 'Buscando…' : 'Buscar ahora'}
        </Button>
      </div>

      {!cargando && hilos.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Todavía no hay conversaciones. En cuanto alguien escriba por Messenger, por Instagram o
              por WhatsApp, el hilo aparece aquí.
            </p>
            <Button variant="outline" onClick={sincronizar} disabled={sincronizando}>
              Buscar ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {hilos.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => void abrir(h.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-accent)] ${
                        abierto === h.id ? 'bg-[var(--color-accent)]' : ''
                      }`}
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-primary)]">
                        {h.lead?.grado ?? h.quien.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{h.quien}</p>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CANAL[h.canal].clase}`}
                          >
                            {CANAL[h.canal].label}
                          </span>
                          {h.sinLeer > 0 && (
                            <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary-foreground)]">
                              {h.sinLeer}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                          {h.ultimoEntrante ? '' : 'Tú: '}
                          {h.ultimoTexto ?? 'Sin mensajes'}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground)]">
                        {cuando(h.ultimoAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 py-4">
              {!hilo ? (
                <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
                  Elige un hilo para leerlo y contestar.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                    <p className="text-sm font-medium">{hilo.quien}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CANAL[hilo.canal].clase}`}>
                      {CANAL[hilo.canal].label}
                    </span>
                    {hilo.estado !== 'open' && (
                      <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px]">
                        {ESTADO[hilo.estado]}
                      </span>
                    )}
                  </div>

                  <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {mensajes.map((m) => (
                      <li
                        key={m.id}
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          m.entrante
                            ? 'bg-[var(--color-accent)]'
                            : 'ml-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.texto || '(sin texto)'}</p>
                        <p className="mt-1 text-[10px] opacity-70">{cuando(m.cuando)}</p>
                      </li>
                    ))}
                    {mensajes.length === 0 && (
                      <li className="py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                        Sin mensajes guardados de este hilo todavía.
                      </li>
                    )}
                  </ul>

                  {!hilo.respondible ? (
                    <p className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                      {hilo.canal === 'whatsapp'
                        ? 'WhatsApp se contesta desde su propia pantalla, con plantilla si la ventana de 24 h ya cerró.'
                        : `Por ${CANAL[hilo.canal].label} todavía no se contesta desde aquí.`}
                    </p>
                  ) : !puedeResponder ? (
                    <p className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                      Tu rol en este proyecto deja leer, no contestar.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        rows={3}
                        placeholder="Escribe tu respuesta…"
                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void mandar()} disabled={trabajando || !texto.trim()}>
                          {trabajando ? 'Mandando…' : 'Mandar'}
                        </Button>
                        <Button variant="outline" onClick={() => void proponer()} disabled={trabajando}>
                          Proponer respuesta
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
