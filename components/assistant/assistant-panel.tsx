'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconHistory,
  IconPanelRight,
  IconPlug,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconTrash,
} from '@/components/icons';
import { useProjects } from '@/components/projects-provider';
import { PROJECT_SECTION_LABEL, type ProjectSection } from '@/src/projects/types';
import { cn } from '@/lib/utils';
import { Compose } from './compose';
import { Hilo } from './hilo';
import { enEscritorio, usePanelPrefs } from './panel-prefs';
import { useAsistente } from './use-asistente';

/**
 * Goossip SIEMPRE abierto: la tercera columna del escritorio.
 *
 * Hasta la corrida 7 el Asistente era un cajón que se montaba ENCIMA del
 * contenido. Eso convertía cada pregunta en una interrupción: para ver tus
 * leads mientras Goossip te contesta sobre ellos había que cerrarlo. Aquí el
 * panel es una columna de verdad —el contenido se reacomoda, no se tapa— y por
 * eso puede quedarse abierto todo el día sin estorbar.
 *
 * Tres cosas que se decidieron y no se ven:
 *
 *  1. **Plegar deja una TIRA con badge, no lo cierra.** Cerrarlo del todo
 *     mataría la mitad de la guía activa: el número de pendientes se ve sin
 *     abrir nada, y eso es lo que hace que alguien abra.
 *  2. **El ancho se guarda y el plegado también**, en el navegador y en el
 *     usuario. Un mueble que se reacomoda solo cada vez que entras no es un
 *     mueble, es un estorbo.
 *  3. **Abajo de 1280 px esto no existe.** El celular sigue con su cajón, que
 *     esta corrida no toca. El `hidden panel:flex` no es responsive por deporte:
 *     dos paneles montados a la vez pelearían por ⌘K y por el foco.
 */

interface Sugerencia {
  id: string;
  texto: string;
  urgencia: 'alta' | 'media' | 'baja';
  accion: { etiqueta: string; href?: string; prompt?: string };
}

interface Guia {
  proyecto: { id: string; nombre: string };
  puedeOperar: boolean;
  conectados: string[];
  porReconectar: string[];
  kitCompleto: boolean;
  leadsSinContactar: number;
  piezasSinDecidir: number;
  sugerencias: Sugerencia[];
}

const URGENCIA_COLOR: Record<Sugerencia['urgencia'], string> = {
  alta: 'border-l-[var(--color-destructive)]',
  media: 'border-l-amber-500',
  baja: 'border-l-[var(--color-primary)]',
};

/** "Estás en Leads". Sale de la URL, que es lo único que siempre está al día. */
function nombreDePantalla(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/[^/]+(?:\/([^/?#]+))?/);
  if (m) {
    const seccion = (m[1] ?? 'inicio') as ProjectSection;
    return PROJECT_SECTION_LABEL[seccion] ?? seccion;
  }
  const sueltas: Record<string, string> = {
    '/': 'Inicio',
    '/projects': 'Proyectos',
    '/leads': 'Leads',
    '/conexiones': 'Conexiones',
    '/campanas': 'Campañas',
    '/contenido': 'Contenido',
    '/equipo': 'Equipo',
  };
  return sueltas[pathname] ?? null;
}

export function AssistantPanel({ inicialAutonomia }: { inicialAutonomia?: 'propone' | 'publica' }) {
  const { active } = useProjects();
  const pathname = usePathname();
  const prefs = usePanelPrefs();
  const projectId = active?.id ?? null;

  const asistente = useAsistente(projectId);
  const [guia, setGuia] = useState<Guia | null>(null);
  const [historial, setHistorial] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [autonomia, setAutonomia] = useState<'propone' | 'publica'>(inicialAutonomia ?? 'propone');

  const pantalla = nombreDePantalla(pathname);

  // ⌘K / Ctrl+K pliega y despliega. Escape pliega. El gesto es el mismo de
  // siempre; lo que cambió es que "abrir" ya no tapa nada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enEscritorio()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        prefs.alternar();
      }
      if (e.key === 'Escape' && !prefs.plegado) prefs.plegar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs]);

  /**
   * Cualquier pantalla le puede DICTAR algo a Goossip (`goossip:dictar`).
   *
   * Lo trajo la corrida 7 para el botón "Generar pieza" de la auditoría de
   * marca, que vive tres componentes más abajo y en otro árbol. Ahí lo
   * escuchaba el cajón; aquí tiene que escucharlo TAMBIÉN el panel, porque de
   * 1250 px para arriba el cajón está oculto por CSS y el clic se iba al vacío:
   * el usuario apretaba y no pasaba nada visible.
   *
   * El reparto es el mismo del atajo ⌘K —`enEscritorio()` decide de quién es el
   * evento— para que los dos oyentes montados no manden el prompt dos veces.
   * Y despliega antes de mandar: una respuesta que llega a un panel plegado es
   * una respuesta que nadie lee.
   */
  const { enviar } = asistente;
  useEffect(() => {
    const onDictar = (e: Event) => {
      if (!enEscritorio()) return;
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      prefs.desplegar();
      void enviar(prompt, { autonomia, pantalla: pathname });
    };
    window.addEventListener('goossip:dictar', onDictar);
    return () => window.removeEventListener('goossip:dictar', onDictar);
  }, [autonomia, enviar, pathname, prefs]);

  // La guía se refresca al cambiar de proyecto Y de pantalla: mover un lead a
  // "contactado" tiene que apagar el aviso sin que nadie recargue.
  useEffect(() => {
    if (!projectId) {
      setGuia(null);
      return;
    }
    let vivo = true;
    fetch(`/api/projects/${projectId}/guia`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.proyecto) setGuia(d);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, pathname]);

  const { cargarConversaciones } = asistente;
  useEffect(() => {
    if (!historial) return;
    const t = setTimeout(() => void cargarConversaciones(busqueda || undefined), 180);
    return () => clearTimeout(t);
  }, [busqueda, cargarConversaciones, historial]);

  const guardarAutonomia = useCallback((a: 'propone' | 'publica') => {
    setAutonomia(a);
    void fetch('/api/me/panel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autonomia: a }),
    }).catch(() => undefined);
  }, []);

  const pendientes = guia?.sugerencias.length ?? 0;
  const puedeOperar = guia?.puedeOperar ?? false;

  /* ---- plegado: la tira ---- */
  if (prefs.plegado) {
    return (
      <aside className="asistente-aside hidden shrink-0 border-l border-[var(--color-border)] bg-[var(--color-background-elevated)] panel:sticky panel:top-0 panel:flex panel:h-[100dvh] panel:w-[var(--asistente-w,48px)] panel:flex-col panel:items-center panel:gap-3 panel:py-3">
        <button
          type="button"
          onClick={prefs.desplegar}
          aria-label="Abrir Goossip (Ctrl+K)"
          title="Goossip · Ctrl+K"
          className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white"
        >
          <IconSparkles className="h-4.5 w-4.5" />
          {/* El número no cabe en 48 px, pero la señal de "hay algo que
              atender" no se puede perder al plegar. El badge va por DENTRO del
              borde derecho: colgado hacia afuera queda a dos píxeles del filo
              de la ventana y se lee como recortado. */}
          {pendientes > 0 && (
            <span className="absolute -top-1.5 right-0 grid h-4 min-w-4 translate-x-1/3 place-items-center rounded-full bg-[var(--color-destructive)] px-1 text-[9px] font-bold text-white">
              {pendientes}
            </span>
          )}
        </button>
        <span className="mt-1 text-[10px] [writing-mode:vertical-rl] text-[var(--color-muted-foreground)]">
          Goossip
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="asistente-aside relative hidden shrink-0 border-l border-[var(--color-border)] bg-[var(--color-background-elevated)] panel:sticky panel:top-0 panel:flex panel:h-[100dvh] panel:w-[var(--asistente-w,360px)] panel:flex-col"
      aria-label="Goossip"
    >
      {/* El tirador del borde IZQUIERDO. Invisible hasta que lo tocas: una
          línea permanente se lee como un error de alineación. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Cambiar el ancho del panel"
        data-arrastrando={prefs.arrastrando ? 'si' : undefined}
        onPointerDown={prefs.empezarArrastre}
        className="asistente-grip"
      />

      <header className="shrink-0 border-b border-[var(--color-border)] p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <IconSparkles className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <h2 className="truncate text-sm font-semibold">
                Goossip · {guia?.proyecto.nombre ?? active?.name ?? 'sin proyecto'}
              </h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void asistente.nuevaConversacion()}
              aria-label="Conversación nueva"
              title="Conversación nueva"
              className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <IconPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setHistorial((v) => !v)}
              aria-label="Historial de conversaciones"
              title="Historial"
              className={cn(
                'grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
                historial && 'bg-[var(--color-accent)] text-[var(--color-foreground)]',
              )}
            >
              <IconHistory className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={prefs.plegar}
              aria-label="Plegar el panel"
              title="Plegar (Ctrl+K)"
              className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <IconPanelRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Los chips de contexto. El de la PANTALLA es el que faltaba: Goossip
            sabe dónde estás parado y por eso "dale seguimiento a este" ya no
            obliga a explicarle a qué. */}
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
          {pantalla && (
            <Badge variant="outline" className="gap-1">
              Estás en {pantalla}
            </Badge>
          )}
          {guia && (
            <>
              <Badge variant="outline" className="gap-1">
                <IconPlug className="h-3 w-3" />
                {guia.conectados.length} conectados
              </Badge>
              {guia.leadsSinContactar > 0 && (
                <Badge variant="outline" className="gap-1">
                  <IconTarget className="h-3 w-3" />
                  {guia.leadsSinContactar} sin contactar
                </Badge>
              )}
              {pendientes > 0 && (
                <Badge variant="outline">{pendientes} por atender</Badge>
              )}
            </>
          )}
        </div>
      </header>

      {!projectId ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          <p>Goossip siempre trabaja dentro de un proyecto. Elige uno en el menú.</p>
        </div>
      ) : historial ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[var(--color-border)] p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2">
              <IconSearch className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en las conversaciones…"
                aria-label="Buscar en las conversaciones"
                className="w-full bg-transparent py-1.5 text-xs focus-visible:outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {asistente.conversaciones.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                {busqueda ? 'Nada con esas palabras.' : 'Todavía no hay conversaciones guardadas.'}
              </p>
            )}
            {asistente.conversaciones.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--color-accent)]',
                  c.id === asistente.conversationId && 'bg-[var(--color-accent)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    void asistente.abrirConversacion(c.id);
                    setHistorial(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs">{c.titulo}</span>
                  <span className="block text-[10px] text-[var(--color-muted-foreground)]">
                    {c.mensajes} mensajes · {new Date(c.actualizado).toLocaleDateString('es-MX')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void asistente.borrarConversacion(c.id)}
                  aria-label={`Borrar «${c.titulo}»`}
                  title="Borrar"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--color-muted-foreground)] opacity-0 hover:text-[var(--color-destructive)] group-hover:opacity-100"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {guia && guia.sugerencias.length > 0 && (
            <div
              /*
                El alto va en PORCENTAJE del panel, no en píxeles. Con `max-h-44`
                (176 px) y el panel angosto, la segunda sugerencia quedaba
                cortada a media altura de su botón: se ve como un error de
                pintura, no como "hay más abajo". Se vio en la captura de 1280.
              */
              className="max-h-[38%] shrink-0 space-y-1.5 overflow-y-auto border-b border-[var(--color-border)] p-2.5"
            >
              {guia.sugerencias.slice(0, 3).map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'rounded-r-lg border-l-2 bg-[var(--color-accent)]/40 py-1.5 pl-2.5 pr-2',
                    URGENCIA_COLOR[s.urgencia],
                  )}
                >
                  <p className="text-xs leading-snug">{s.texto}</p>
                  <div className="mt-1">
                    {s.accion.href ? (
                      <Button asChild size="sm" variant="outline" className="h-6 text-[11px]">
                        <Link href={s.accion.href}>{s.accion.etiqueta}</Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px]"
                        disabled={asistente.pensando}
                        onClick={() =>
                          void asistente.enviar(s.accion.prompt ?? s.accion.etiqueta, {
                            autonomia,
                            pantalla: pathname,
                          })
                        }
                      >
                        {s.accion.etiqueta}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Hilo
            mensajes={asistente.mensajes}
            pensando={asistente.pensando}
            trabajando={asistente.trabajando}
            projectId={projectId}
            vacio={
              <div className="px-2 py-6 text-center text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                <p>
                  Suéltame aquí un PDF, una foto o un video y dime qué hacemos con eso.
                  <br />
                  También puedes escribir <b>@</b> para traer un lead o <b>/</b> para los comandos.
                </p>
              </div>
            }
          />

          <Compose
            projectId={projectId}
            pensando={asistente.pensando}
            puedeOperar={puedeOperar}
            autonomia={autonomia}
            onAutonomia={guardarAutonomia}
            onDetener={asistente.detener}
            onEnviar={(envio) =>
              void asistente.enviar(envio.texto, {
                adjuntos: envio.adjuntos,
                menciones: envio.menciones,
                autonomia: envio.autonomia,
                pantalla: pathname,
              })
            }
          />
        </>
      )}
    </aside>
  );
}
