'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-provider';
import { IconCheck, IconSparkles } from '@/components/icons';
import { PreviewRed, type PiezaParaVisor } from '@/components/contenido/preview-red';
import { GuiaDeLaRed, type GuiaUI, type UsoUI } from '@/components/contenido/guia-red';
import { Compuerta, type VeredictoUI } from '@/components/contenido/compuerta';
import { REDES_DE_LA_SALA, formatosDeLaSala } from '@/src/creative/visor';
import { RED_LABEL, type RedSlug } from '@/src/creative/specs';
import { cn } from '@/lib/utils';
import type { PiezaUI } from '@/components/marca/galeria-piezas';

/**
 * La SALA DE ARTE Y COMUNICACIÓN.
 *
 * Lo que se hace aquí, en una frase: se mira la pieza como la va a ver la gente
 * en cada red, se comprueba que la red la va a aceptar, y se decide.
 *
 * Tres columnas y cada una contesta una pregunta distinta:
 *
 *   izquierda  — ¿QUÉ pieza y qué digo? La tira de piezas del proyecto y el
 *                texto, editable, porque el texto es la mitad de la publicación
 *                y hasta ahora solo se podía ver, no arreglar.
 *   centro     — ¿CÓMO se va a ver? El visor fiel, red por red y lienzo por
 *                lienzo, con el recorte de verdad.
 *   derecha    — ¿SE PUEDE PUBLICAR? La compuerta anti-baneo y la guía de cómo
 *                se postea en esa red, con la cuota que queda hoy.
 *
 * Por qué la compuerta NO se corre sola al escribir: cuesta una llamada al
 * modelo y medir el archivo. Correrla en cada tecla sería quemar tokens para
 * decir treinta veces lo mismo. Se corre al cambiar de red, al cargar, y cuando
 * el usuario lo pide — y se apaga el verde viejo en cuanto el texto cambia, que
 * es lo que evita aprobar mirando un semáforo de hace dos párrafos.
 */

export function Sala({
  projectId,
  puedeEditar,
  nombreProyecto,
  logo,
}: {
  projectId: string;
  puedeEditar: boolean;
  nombreProyecto: string;
  logo: string | null;
}) {
  const toast = useToast();

  const [piezas, setPiezas] = useState<PiezaUI[]>([]);
  const [cargando, setCargando] = useState(true);
  const [elegida, setElegida] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [red, setRed] = useState<RedSlug>('instagram');
  const [formatoId, setFormatoId] = useState<string | null>(null);

  const [guia, setGuia] = useState<GuiaUI | null>(null);
  const [uso, setUso] = useState<UsoUI | null>(null);
  const [veredicto, setVeredicto] = useState<VeredictoUI | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [adaptando, setAdaptando] = useState(false);
  const [fresco, setFresco] = useState(true);

  const pieza = useMemo(() => piezas.find((p) => p.id === elegida) ?? null, [piezas, elegida]);

  // --- cargar las piezas -----------------------------------------------------
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/piezas`, { cache: 'no-store' });
      const d = await res.json();
      const lista: PiezaUI[] = d?.piezas ?? [];
      setPiezas(lista);
      if (lista.length && !elegida) {
        setElegida(lista[0]!.id);
        setTexto(lista[0]!.brief);
        if (esRedDeLaSala(lista[0]!.red)) setRed(lista[0]!.red as RedSlug);
        setFormatoId(lista[0]!.formato);
      }
    } catch {
      setPiezas([]);
    } finally {
      setCargando(false);
    }
  }, [projectId, elegida]);

  useEffect(() => {
    void cargar();
    // Solo al montar: `cargar` cambia con `elegida` y recargar la galería cada
    // vez que alguien cambia de pieza sería pedir la lista entera por un clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // --- la guía y la cuota, al cambiar de red ---------------------------------
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/sala?red=${red}`, { cache: 'no-store' });
        const d = await res.json();
        if (!vivo) return;
        setGuia(d?.guia ?? null);
        setUso(d?.uso ?? null);
      } catch {
        if (vivo) {
          setGuia(null);
          setUso(null);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [projectId, red]);

  // --- la compuerta ----------------------------------------------------------
  const revisar = useCallback(async () => {
    setRevisando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/compuerta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ red, formatoId, texto, piezaId: elegida }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'No se pudo revisar.');
      setVeredicto(d);
      setFresco(true);
    } catch (e) {
      toast.push({
        title: 'No se pudo revisar la pieza',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setRevisando(false);
    }
  }, [projectId, red, formatoId, texto, elegida, toast]);

  // Al cambiar de red o de pieza se revisa sola: es el momento en que la
  // respuesta cambia de verdad. Al escribir, NO — solo se marca el semáforo
  // como viejo.
  useEffect(() => {
    if (!elegida) return;
    void revisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [red, elegida]);

  const cambiarTexto = (v: string) => {
    setTexto(v);
    setFresco(false);
  };

  const elegirPieza = (p: PiezaUI) => {
    setElegida(p.id);
    setTexto(p.brief);
    if (esRedDeLaSala(p.red)) setRed(p.red as RedSlug);
    setFormatoId(p.formato);
    setFresco(true);
  };

  // --- adaptar ---------------------------------------------------------------
  const adaptar = useCallback(async () => {
    if (!elegida) return;
    setAdaptando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/piezas/${elegida}/calidad`, {
        method: 'POST',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'No se pudo adaptar.');
      toast.push({
        title: 'Pieza adaptada',
        description: (d.queSeHizo ?? []).join(' '),
        variant: 'success',
      });
      setPiezas((xs) =>
        xs.map((p) => (p.id === elegida ? { ...p, url: d.url, ancho: d.ancho, alto: d.alto } : p)),
      );
      await revisar();
    } catch (e) {
      toast.push({
        title: 'No se pudo adaptar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setAdaptando(false);
    }
  }, [projectId, elegida, revisar, toast]);

  // --- aprobar ---------------------------------------------------------------
  const aprobar = useCallback(async () => {
    if (!elegida) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/piezas/${elegida}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'aprobada' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 422 es la compuerta diciendo que no. Se enseña el motivo con la regla
        // citada, no un "no se pudo" que no le sirve a nadie.
        throw new Error(d?.error ?? 'No se pudo aprobar.');
      }
      toast.push({ title: 'Aprobada', variant: 'success' });
      setPiezas((xs) => xs.map((p) => (p.id === elegida ? { ...p, estado: 'aprobada' } : p)));
    } catch (e) {
      toast.push({
        title: 'La compuerta no la deja pasar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    }
  }, [projectId, elegida, toast]);

  const lienzos = useMemo(() => formatosDeLaSala(red), [red]);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- la tira de redes */}
      <div className="flex flex-wrap items-center gap-1.5" data-sala-redes>
        {REDES_DE_LA_SALA.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRed(r)}
            aria-current={r === red ? 'true' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              r === red
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
            )}
          >
            {RED_LABEL[r]}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-[var(--color-muted-foreground)]">
          {lienzos.length} {lienzos.length === 1 ? 'lienzo' : 'lienzos'} en {RED_LABEL[red]}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,320px)]">
        {/* ------------------------------------------ izquierda: qué pieza */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--color-muted-foreground)]">Tus piezas</p>
          {cargando ? (
            <div className="grid grid-cols-3 gap-2 xl:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton aspect-square w-full rounded-lg" />
              ))}
            </div>
          ) : piezas.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                Todavía no hay piezas. Ve a <strong>Piezas</strong> y aprieta “Hazme una pieza”.
              </CardContent>
            </Card>
          ) : (
            <div className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
              {piezas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirPieza(p)}
                  title={p.brief}
                  className={cn(
                    'overflow-hidden rounded-lg border-2 transition-colors',
                    p.id === elegida
                      ? 'border-[var(--color-primary)]'
                      : 'border-transparent hover:border-[var(--color-border)]',
                  )}
                >
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.brief} className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="grid aspect-square w-full place-items-center bg-[var(--color-accent)] text-[10px] text-[var(--color-muted-foreground)]">
                      sin imagen
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="sala-texto" className="text-xs font-semibold">
              Lo que va a decir
            </label>
            <Textarea
              id="sala-texto"
              value={texto}
              onChange={(e) => cambiarTexto(e.target.value)}
              rows={7}
              disabled={!puedeEditar}
              placeholder="Escribe aquí el texto que acompaña la pieza y míralo cortarse en cada red."
              className="text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--color-muted-foreground)]">
                {texto.length} caracteres
              </span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void revisar()} disabled={revisando}>
                {revisando ? 'Revisando…' : 'Revisar de nuevo'}
              </Button>
            </div>
          </div>
        </div>

        {/* --------------------------------------------- centro: el visor */}
        <div className="min-w-0">
          {pieza ? (
            <PreviewRed
              pieza={
                {
                  id: pieza.id,
                  url: pieza.url,
                  red: pieza.red,
                  formato: pieza.formato,
                  brief: pieza.brief,
                } satisfies PiezaParaVisor
              }
              texto={texto}
              proyecto={nombreProyecto}
              logo={logo}
              soloRed={red}
              formatoInicial={lienzos.some((l) => l.id === formatoId) ? formatoId : lienzos[0]?.id}
              onFormato={(f) => {
                setFormatoId(f);
                setFresco(false);
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">
                Elige una pieza de la izquierda para verla en {RED_LABEL[red]}.
              </CardContent>
            </Card>
          )}
        </div>

        {/* ------------------------------ derecha: la compuerta y la guía */}
        <div className="space-y-4">
          <Compuerta
            veredicto={veredicto}
            revisando={revisando}
            fresco={fresco}
            adaptando={adaptando}
            puedeEditar={puedeEditar}
            onRevisar={() => void revisar()}
            onAdaptar={() => void adaptar()}
            onAprobar={() => void aprobar()}
            estadoDeLaPieza={pieza?.estado ?? null}
          />
          <GuiaDeLaRed guia={guia} uso={uso} />
        </div>
      </div>
    </div>
  );
}

function esRedDeLaSala(r: string): r is RedSlug {
  return (REDES_DE_LA_SALA as string[]).includes(r);
}

/** El botón que lleva a hacer una pieza nueva, para cuando la Sala está vacía. */
export function SinPiezas({ projectId }: { projectId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <IconSparkles className="h-6 w-6 text-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted-foreground)]">
          La Sala se abre con una pieza delante. Haz la primera y vuelve.
        </p>
        <Button asChild className="btn-brand">
          <a href={`/projects/${projectId}/contenido?vista=piezas`}>
            <IconCheck className="h-4 w-4" /> Ir a Piezas
          </a>
        </Button>
        <Badge variant="outline" className="text-[10px]">
          También puedes pedírsela al Asistente
        </Badge>
      </CardContent>
    </Card>
  );
}
