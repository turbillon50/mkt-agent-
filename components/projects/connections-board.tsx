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
  IconWhatsApp,
} from '@/components/icons';
import {
  CONNECTOR_GROUPS,
  CONNECTOR_GROUP_BLURB,
  CONNECTOR_GROUP_LABEL,
  PROJECT_EVENT_LABEL,
  type ConnectionState,
  type ConnectorGroup,
} from '@/src/projects/types';
import { ConnectionBadge } from './connection-badge';

/**
 * Las conexiones del proyecto, en tres grupos.
 *
 * Todo lo que se conecta pasa por Composio con su app administrada: el usuario
 * aprieta "Conectar", ve la pantalla de permisos del proveedor y vuelve. No hay
 * app de developer de Goossip de por medio, ni tokens que nadie copie a mano.
 *
 * El orden y el estado los decide el SERVIDOR. Aquí solo se pinta lo que llega
 * y se disparan las acciones. Cero notas internas: si algo no está listo dice
 * "Próximamente" y ya.
 */

interface Card {
  id: string;
  slug: string;
  via: 'composio' | 'goossip';
  group: ConnectorGroup;
  label: string;
  blurb: string;
  note?: string;
  logo: string;
  mode: 'oauth' | 'datos' | 'automatico';
  state: ConnectionState;
  detail: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  pending: string | null;
  data: Record<string, any>;
}

/**
 * Los conectores que NO son de Composio no tienen logo en su catálogo (pedirlo
 * devuelve un cuadrito gris de relleno, medido), así que llevan el ícono de la
 * casa. Los 21 de Composio sí: su marca de verdad.
 */
const ICONO_PROPIO: Record<string, React.ElementType> = {
  sitio: IconGlobe,
  mcp: IconBox,
  whatsapp: IconWhatsApp,
  meta: IconFacebook,
};

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
  const [abierta, setAbierta] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

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

  // La vuelta del permiso: si trae error se dice tal cual, y si salió bien se
  // felicita con el nombre del conector, no con un "ok" a secas.
  useEffect(() => {
    const error = search.get('error');
    if (error) push({ title: error, variant: 'error' });
    const conectado = search.get('conectado');
    if (conectado) push({ title: 'Cuenta conectada', variant: 'success' });
    if (search.get('meta') === 'elegir') setAbierta('meta');
  }, [search, push]);

  const aplicar = (data: { cards?: Card[] }) => {
    if (data.cards) setCards(data.cards);
    void cargar();
    router.refresh();
  };

  async function pedir(canal: string, url: string, init: RequestInit) {
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

  async function desconectar(canal: string, label: string) {
    const ok = window.confirm(`¿Quitar ${label} de este proyecto?`);
    if (!ok) return;
    const r = await pedir(canal, `/api/projects/${projectId}/connections/${canal}`, {
      method: 'DELETE',
    });
    if (r) push({ title: `${label} desconectado`, variant: 'success' });
  }

  async function conectarConComposio(canal: string) {
    setTrabajando(canal);
    try {
      const res = await fetch('/api/connections/composio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId, toolkit: canal }),
      });
      const data = await res.json();
      if (res.ok && data.alreadyConnected) {
        setTrabajando(null);
        push({ title: 'Ya estaba conectado.', variant: 'success' });
        router.refresh();
        return;
      }
      if (!res.ok || !data.redirectUrl) throw new Error(data.error ?? 'No se pudo.');

      // La ventana de permisos se abre APARTE y esta pantalla se queda donde
      // está. Quien conecta no pierde su lugar, y si el proveedor manda a la
      // persona a iniciar sesión —pasa con Slack y con Google— el regreso no
      // depende de que el navegador acierte a volver a Goossip.
      const ventana = window.open(
        data.redirectUrl,
        `goossip-conexion-${canal}`,
        'width=640,height=780,noopener=no',
      );
      if (!ventana) {
        // Con el bloqueador de ventanas encendido no hay a dónde abrir: se va
        // en la misma pestaña, que siempre funciona.
        window.location.href = data.redirectUrl;
        return;
      }

      // La verdad de si quedó es de Composio, no del navegador: se pregunta.
      const inicio = Date.now();
      const cada = window.setInterval(async () => {
        if (Date.now() - inicio > 5 * 60 * 1000) {
          window.clearInterval(cada);
          setTrabajando(null);
          push({ title: 'No se completó la conexión. Inténtalo otra vez.', variant: 'error' });
          return;
        }
        try {
          const r = await fetch(
            `/api/connections/composio/status?project=${projectId}&canal=${encodeURIComponent(canal)}`,
            { cache: 'no-store' },
          );
          const s = await r.json();
          if (s.connected) {
            window.clearInterval(cada);
            try {
              ventana.close();
            } catch {
              // Si el navegador no deja cerrarla, no pasa nada: ya está conectada.
            }
            setTrabajando(null);
            push({ title: 'Cuenta conectada', variant: 'success' });
            void cargar();
            router.refresh();
          }
        } catch {
          // Un tropiezo de red no cancela la espera: se vuelve a preguntar.
        }
      }, 3000);
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
      setTrabajando(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando tus conexiones…</p>;
  }

  const grupos = CONNECTOR_GROUPS.filter((g) => cards.some((c) => c.group === g));

  return (
    <div className="space-y-6">
      {/* Una sola vez, arriba, y sin explicar la maquinaria. */}
      <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
        Al conectar verás una pantalla de permisos de Composio, nuestro proveedor de conexiones
        seguras.
      </p>

      {grupos.map((grupo) => (
        <section key={grupo} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{CONNECTOR_GROUP_LABEL[grupo]}</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {CONNECTOR_GROUP_BLURB[grupo]}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {cards
              .filter((c) => c.group === grupo)
              .map((card) => (
                <Tarjeta
                  key={card.id}
                  card={card}
                  projectId={projectId}
                  puedeConectar={puedeConectar}
                  abierto={abierta === card.id}
                  trabajando={trabajando === card.id}
                  onAbrir={() => setAbierta(abierta === card.id ? null : card.id)}
                  onCerrar={() => setAbierta(null)}
                  onConectarComposio={() => void conectarConComposio(card.id)}
                  onDesconectar={() => void desconectar(card.id, card.label)}
                  onPedir={pedir}
                />
              ))}
          </div>
        </section>
      ))}

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
}

// ---------------------------------------------------------------------------
// La tarjeta de un conector
// ---------------------------------------------------------------------------

function Tarjeta({
  card,
  projectId,
  puedeConectar,
  abierto,
  trabajando,
  onAbrir,
  onCerrar,
  onConectarComposio,
  onDesconectar,
  onPedir,
}: {
  card: Card;
  projectId: string;
  puedeConectar: boolean;
  abierto: boolean;
  trabajando: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onConectarComposio: () => void;
  onDesconectar: () => void;
  onPedir: (canal: string, url: string, init: RequestInit) => Promise<any>;
}) {
  const proximamente = card.state === 'proximamente';
  return (
    <Card className={proximamente ? 'opacity-70' : 'card-glow'}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ${
                card.via === 'composio' ? 'bg-white' : 'bg-[var(--color-accent)]'
              }`}
            >
              {card.via === 'composio' ? (
                // El logo viene del catálogo de Composio (`toolkit.meta.logo`).
                <img src={card.logo} alt="" className="h-6 w-6 object-contain" />
              ) : (
                <IconoPropio slug={card.id} />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-medium">{card.label}</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {card.detail ?? card.blurb}
              </p>
            </div>
          </div>
          <ConnectionBadge state={card.state} />
        </div>

        {card.note && (
          <p className="text-[11px] text-[var(--color-muted-foreground)]">{card.note}</p>
        )}

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

        {!proximamente && puedeConectar && (
          <div className="flex flex-wrap items-center gap-2">
            {card.state === 'conectado' ? (
              <>
                {/* Lo de Composio no tiene nada que ajustar aquí: lo que hay
                    que elegir se elige en la pantalla del proveedor. */}
                {card.via === 'goossip' && (
                  <Button size="sm" variant="outline" onClick={onAbrir}>
                    {abierto ? 'Cerrar' : 'Ajustar'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={trabajando} onClick={onDesconectar}>
                  Quitar
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="btn-brand"
                disabled={trabajando}
                onClick={() => {
                  if (card.via === 'composio') return onConectarComposio();
                  if (card.id === 'meta' && !card.data.candidates?.length) {
                    window.location.href = `/api/connections/meta/start?project=${projectId}`;
                    return;
                  }
                  if (card.id === 'sitio') {
                    void onPedir(card.id, `/api/projects/${projectId}/connections/sitio`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: '{}',
                    });
                    return onAbrir();
                  }
                  onAbrir();
                }}
              >
                {trabajando
                  ? 'Esperando a que termines en la otra ventana…'
                  : card.state === 'reconectar'
                    ? 'Reconectar'
                    : 'Conectar'}
              </Button>
            )}
          </div>
        )}

        {abierto && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <Detalle
              card={card}
              projectId={projectId}
              trabajando={trabajando}
              onPedir={onPedir}
              onCerrar={onCerrar}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IconoPropio({ slug }: { slug: string }) {
  const Icon = ICONO_PROPIO[slug] ?? IconGlobe;
  return <Icon className="h-4.5 w-4.5 text-[var(--color-foreground)]" />;
}

// ---------------------------------------------------------------------------
// Lo que se abre al ajustar los canales propios de Goossip
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
  onPedir: (canal: string, url: string, init: RequestInit) => Promise<any>;
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
            const r = await onPedir('sitio', `/api/projects/${projectId}/connections/sitio`, json({}));
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
