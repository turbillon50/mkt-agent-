'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import {
  IconBox,
  IconCheck,
  IconCopy,
  IconFacebook,
  IconGlobe,
  IconGoogle,
  IconLinkedIn,
  IconTikTok,
  IconWhatsApp,
  IconX,
} from '@/components/icons';
import { PROJECT_EVENT_LABEL, type ConnectionChannel, type ConnectionState } from '@/src/projects/types';
import { ConnectionBadge } from './connection-badge';

/**
 * Las conexiones del proyecto.
 *
 * Orden por VALOR para quien vende — lo decide el servidor, no esta pantalla.
 * Aquí solo se pinta lo que llega y se disparan las acciones.
 *
 * Regla de la corrida 3: cero notas internas. Si un canal no está listo, dice
 * "Próximamente" y ya. Nada de explicarle al cliente qué nos falta registrar.
 */

const ICONO: Record<ConnectionChannel, React.ElementType> = {
  meta: IconFacebook,
  whatsapp: IconWhatsApp,
  google: IconGoogle,
  linkedin: IconLinkedIn,
  x: IconX,
  tiktok: IconTikTok,
  sitio: IconGlobe,
  mcp: IconBox,
};

interface Card {
  id: ConnectionChannel;
  label: string;
  description: string;
  mode: 'oauth' | 'datos' | 'automatico';
  state: ConnectionState;
  detail: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  pending: string | null;
  data: Record<string, any>;
}

interface Evento {
  tipo: keyof typeof PROJECT_EVENT_LABEL;
  quien: string | null;
  cuando: string;
  detalle: Record<string, unknown>;
}

export function ConnectionsBoard({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const { push } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [puedeConectar, setPuedeConectar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState<ConnectionChannel | null>(null);
  const [trabajando, setTrabajando] = useState<ConnectionChannel | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/connections`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar las conexiones.');
      setCards(data.cards ?? []);
      setEventos(data.eventos ?? []);
      setPuedeConectar(Boolean(data.puedeConectar));
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, push]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Vuelta de Facebook: si trae error se dice tal cual, y si viene bien se abre
  // sola la tarjeta en el paso que falta.
  useEffect(() => {
    const error = search.get('error');
    if (error) push({ title: error, variant: 'error' });
    if (search.get('meta') === 'elegir') setAbierta('meta');
  }, [search, push]);

  const aplicar = (data: { cards?: Card[] }) => {
    if (data.cards) setCards(data.cards);
    void cargar();
    router.refresh();
  };

  async function pedir(canal: ConnectionChannel, url: string, init: RequestInit) {
    setTrabajando(canal);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo.');
      aplicar(data);
      return data;
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
      return null;
    } finally {
      setTrabajando(null);
    }
  }

  async function desconectar(canal: ConnectionChannel, label: string) {
    const ok = window.confirm(`¿Desconectar ${label} de este proyecto?`);
    if (!ok) return;
    const r = await pedir(canal, `/api/projects/${projectId}/connections/${canal}`, {
      method: 'DELETE',
    });
    if (r) push({ title: `${label} desconectado`, variant: 'success' });
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando tus canales…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((card) => {
          const Icon = ICONO[card.id];
          const abierto = abierta === card.id;
          return (
            <Card key={card.id} className={card.state === 'proximamente' ? 'opacity-70' : 'card-glow'}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)] text-[var(--color-foreground)]">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{card.label}</h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {card.detail ?? card.description}
                      </p>
                    </div>
                  </div>
                  <ConnectionBadge state={card.state} />
                </div>

                {card.state === 'conectado' && card.connectedAt && (
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    Conectado por {card.connectedBy ?? 'alguien del equipo'} el{' '}
                    {new Date(card.connectedAt).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                )}

                {card.pending && (
                  <p className="rounded-lg bg-[var(--color-accent)]/60 px-3 py-2 text-[11px] text-[var(--color-foreground)]">
                    {card.pending}
                  </p>
                )}

                {card.state !== 'proximamente' && puedeConectar && (
                  <div className="flex flex-wrap items-center gap-2">
                    {card.state === 'conectado' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAbierta(abierto ? null : card.id)}
                        >
                          {abierto ? 'Cerrar' : 'Ajustar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={trabajando === card.id}
                          onClick={() => void desconectar(card.id, card.label)}
                        >
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="btn-brand"
                        disabled={trabajando === card.id}
                        onClick={() => {
                          if (card.id === 'meta' && !card.data.candidates?.length) {
                            window.location.href = `/api/connections/meta/start?project=${projectId}`;
                            return;
                          }
                          if (card.id === 'linkedin') {
                            void conectarConComposio(card.id);
                            return;
                          }
                          if (card.id === 'sitio') {
                            void pedir(card.id, `/api/projects/${projectId}/connections/sitio`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: '{}',
                            });
                            setAbierta('sitio');
                            return;
                          }
                          setAbierta(abierto ? null : card.id);
                        }}
                      >
                        {trabajando === card.id ? 'Esperando a que termines en la otra ventana…' : 'Conectar'}
                      </Button>
                    )}
                  </div>
                )}

                {abierto && (
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <Detalle
                      card={card}
                      projectId={projectId}
                      trabajando={trabajando === card.id}
                      onPedir={pedir}
                      onCerrar={() => setAbierta(null)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!compact && eventos.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <h3 className="text-sm font-medium">Movimientos recientes</h3>
            <ul className="divide-y divide-[var(--color-border)] text-xs">
              {eventos.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {PROJECT_EVENT_LABEL[e.tipo] ?? e.tipo}
                    {typeof e.detalle?.canal === 'string' && ` · ${e.detalle.canal}`}
                  </span>
                  <span className="shrink-0 text-[var(--color-muted-foreground)]">
                    {e.quien ?? 'Goossip'} ·{' '}
                    {new Date(e.cuando).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );

  async function conectarConComposio(canal: ConnectionChannel) {
    setTrabajando(canal);
    try {
      const res = await fetch('/api/connections/composio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId, canal }),
      });
      const data = await res.json();
      if (res.ok && data.alreadyConnected) {
        setTrabajando(null);
        push({ title: 'Ya estaba conectado.', variant: 'success' });
        router.refresh();
        return;
      }
      if (!res.ok || !data.redirectUrl) throw new Error(data.error ?? 'No se pudo.');
      // La ventana de permisos se abre APARTE. Esta pantalla se queda y
      // pregunta a Goossip (que pregunta a Composio) hasta que la cuenta quede.
      const ventana = window.open(
        data.redirectUrl,
        `goossip-conexion-${canal}`,
        'width=640,height=780,noopener=no',
      );
      if (!ventana) {
        window.location.href = data.redirectUrl;
        return;
      }
      const inicio = Date.now();
      const cada = window.setInterval(async () => {
        if (Date.now() - inicio > 5 * 60 * 1000) {
          window.clearInterval(cada);
          setTrabajando(null);
          push({ title: 'No se completó la conexión. Intenta de nuevo.', variant: 'error' });
          return;
        }
        try {
          const r = await fetch(
            `/api/connections/composio/status?project=${projectId}&canal=${canal}`,
            { cache: 'no-store' },
          );
          const s = await r.json();
          if (s.connected) {
            window.clearInterval(cada);
            try { ventana.close(); } catch {}
            setTrabajando(null);
            push({ title: 'Conectado. Ya puedes cerrar la otra ventana si sigue abierta.', variant: 'success' });
            router.refresh();
          }
        } catch {}
      }, 3000);
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
      setTrabajando(null);
    }
  }
}

// ---------------------------------------------------------------------------
// Lo que se abre al conectar o ajustar cada canal
// ---------------------------------------------------------------------------

function Detalle({
  card,
  projectId,
  trabajando,
  onPedir,
  onCerrar,
}: {
  card: Card;
  projectId: string;
  trabajando: boolean;
  onPedir: (canal: ConnectionChannel, url: string, init: RequestInit) => Promise<any>;
  onCerrar: () => void;
}) {
  const { push } = useToast();
  const [valor, setValor] = useState('');
  const [formIds, setFormIds] = useState<string[]>(
    (card.data.forms ?? []).map((f: { id: string }) => f.id),
  );

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (card.id === 'meta') {
    const candidatas: Array<{ id: string; name: string; instagram: string | null }> =
      card.data.candidates ?? [];
    const disponibles: Array<{ id: string; name: string; status: string; leadsCount: number }> =
      card.data.available_forms ?? [];

    if (candidatas.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium">¿A cuál de tus páginas se conecta este proyecto?</p>
          <div className="space-y-1.5">
            {candidatas.map((p) => (
              <button
                key={p.id}
                disabled={trabajando}
                onClick={async () => {
                  const r = await onPedir(
                    'meta',
                    `/api/projects/${projectId}/meta`,
                    json({ accion: 'pagina', pageId: p.id }),
                  );
                  if (r) push({ title: `${p.name} conectada`, variant: 'success' });
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-xs hover:bg-[var(--color-accent)]/60 disabled:opacity-60"
              >
                <span className="min-w-0 truncate">
                  {p.name}
                  {p.instagram && (
                    <span className="text-[var(--color-muted-foreground)]"> · @{p.instagram}</span>
                  )}
                </span>
                <span className="shrink-0 text-[var(--color-primary)]">Elegir</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs font-medium">¿De qué formularios quieres recibir a la gente?</p>
        {disponibles.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Esta página todavía no tiene formularios de anuncios.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              {disponibles.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-accent)]/60"
                >
                  <input
                    type="checkbox"
                    checked={formIds.includes(f.id)}
                    onChange={(e) =>
                      setFormIds((s) =>
                        e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                    {f.leadsCount} leads
                  </span>
                </label>
              ))}
            </div>
            <Button
              size="sm"
              className="btn-brand"
              disabled={trabajando}
              onClick={async () => {
                const r = await onPedir(
                  'meta',
                  `/api/projects/${projectId}/meta`,
                  json({ accion: 'formularios', formIds }),
                );
                if (r) {
                  push({ title: 'Formularios guardados', variant: 'success' });
                  onCerrar();
                }
              }}
            >
              Guardar
            </Button>
          </>
        )}
      </div>
    );
  }

  if (card.id === 'whatsapp') {
    return (
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">Identificador de tu número de WhatsApp Business</span>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="123456789012345"
            inputMode="numeric"
          />
          <span className="block text-[11px] text-[var(--color-muted-foreground)]">
            Lo encuentras en tu cuenta de WhatsApp Business, junto al número.
          </span>
        </label>
        <Button
          size="sm"
          className="btn-brand"
          disabled={trabajando}
          onClick={async () => {
            const r = await onPedir(
              'whatsapp',
              `/api/projects/${projectId}/connections/whatsapp`,
              json({ waba_phone_id: valor.trim() }),
            );
            if (r) {
              push({ title: 'Número guardado', variant: 'success' });
              onCerrar();
            }
          }}
        >
          Guardar
        </Button>
      </div>
    );
  }

  if (card.id === 'mcp') {
    const fuentes: Array<{ label: string; url: string }> = card.data.sources ?? [];
    return (
      <div className="space-y-2">
        {fuentes.length > 0 && (
          <ul className="space-y-1 text-[11px] text-[var(--color-muted-foreground)]">
            {fuentes.map((f) => (
              <li key={f.url} className="truncate">
                · {f.label}
              </li>
            ))}
          </ul>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium">Dirección de tu catálogo</span>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="https://catalogo.tudominio.com/mcp"
          />
          <span className="block text-[11px] text-[var(--color-muted-foreground)]">
            De aquí saca tu vendedor los precios y las unidades reales.
          </span>
        </label>
        <Button
          size="sm"
          className="btn-brand"
          disabled={trabajando}
          onClick={async () => {
            const r = await onPedir(
              'mcp',
              `/api/projects/${projectId}/connections/mcp`,
              json({ url: valor.trim() }),
            );
            if (r) {
              push({ title: 'Catálogo conectado', variant: 'success' });
              onCerrar();
            }
          }}
        >
          Guardar
        </Button>
      </div>
    );
  }

  if (card.id === 'sitio') {
    const url = card.data.token
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/site/${card.data.token}`
      : null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium">Pon esta dirección en tu formulario</p>
        {url ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--color-muted)] px-3 py-2 text-[11px]">
              {url}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                push({ title: 'Dirección copiada', variant: 'success' });
              }}
            >
              <IconCopy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            Genera la dirección para empezar a recibir.
          </p>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={async () => {
            const r = await onPedir(
              'sitio',
              `/api/projects/${projectId}/connections/sitio`,
              json({}),
            );
            if (r) push({ title: 'Dirección nueva generada', variant: 'success' });
          }}
        >
          Generar una dirección nueva
        </Button>
      </div>
    );
  }

  return (
    <p className="inline-flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
      <IconCheck className="h-3.5 w-3.5" /> Todo listo por aquí.
    </p>
  );
}
