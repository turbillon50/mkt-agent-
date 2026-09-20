'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconGlobe, IconMail, IconPhone, IconTarget, IconWhatsApp, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';
import { cajaDeTodos, type Cuadrante } from '@/src/prospeccion/geo';
import {
  FILTROS_POR_OMISION,
  filtrosEnPalabras,
  objetivosDe,
  type FiltrosBarrido,
  type Objetivo,
} from '@/src/prospeccion/objetivos';
import { lineaDeContadores, type Contadores } from '@/src/prospeccion/narracion';
import type { Motor } from './mapa-motor';

/**
 * La Sala de Prospección: el mapa de lado a lado y a Goossip recorriéndolo.
 *
 * El tablero de la corrida 7 contesta *¿a quién encontré?*. Esta pantalla
 * contesta otra pregunta, que es la que cierra ventas: *¿de dónde salió eso?*.
 * Un vendedor le enseña esto a un prospecto en vivo, el prospecto ve el mapa
 * recorriendo SU ciudad y los negocios de SU calle cayendo uno por uno, y la
 * herramienta se explica sola. Por eso el modo Demo no es un adorno: es el
 * caso de uso.
 *
 * Lo que esta pantalla **no** hace, y es la mitad del diseño:
 *
 *   · no simula nada — cada punto que cae trae un `place_id` que el servidor
 *     acaba de guardar; si Google no contesta, se ve que no contestó;
 *   · no esconde el costo — el contador de búsquedas del mes y lo que va a
 *     costar ESTE recorrido están junto al botón, antes del clic;
 *   · no busca personas — lo que se lee de cada negocio es su sitio público, y
 *     el paso se ve pasar ("leyendo su sitio…") para que nadie tenga que
 *     creerlo de palabra.
 */

interface Prospecto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingsCount: number | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  status: 'nuevo' | 'contactado' | 'descartado' | 'convertido';
  enrichment: {
    email?: string | null;
    whatsapp?: string | null;
    redes?: Record<string, string>;
    leido?: Array<{ url: string; status: number }>;
  };
  leadId: string | null;
}

interface Resumen {
  total: number;
  nuevos: number;
  contadores: Contadores;
  hallazgos: string[];
  costo: { mes: number; tope: number; previsto: number; hechas: number };
  texto: string;
}

const CONTADORES_VACIOS: Contadores = {
  total: 0,
  conTelefono: 0,
  conSitio: 0,
  sinSitio: 0,
  conWhatsapp: 0,
  conCorreo: 0,
  ratingBajo: 0,
  abiertos24h: 0,
};

/** Donde arranca la cámara si el proyecto todavía no tiene un solo prospecto. */
const CENTRO_DE_ARRANQUE = { lat: 19.4326, lng: -99.1332 };

/**
 * Apaga el pulso del cuadrante anterior. Es una función suelta y no dos líneas
 * en el sitio porque TypeScript, al ver el `ref.current = null` de arriba del
 * recorrido, daba por hecho que ahí nunca volvía a haber nada y marcaba el
 * `?.()` del final como no invocable. La función corta esa deducción, que en
 * este caso era falsa: quien lo vuelve a llenar es el evento del cuadrante.
 */
function apagarPulso(ref: React.MutableRefObject<(() => void) | null>) {
  ref.current?.();
  ref.current = null;
}

export interface ArranqueSala {
  zona?: string;
  giros?: string[];
  objetivo?: string;
  sinSitio?: boolean;
  radioM?: number;
  demo?: boolean;
  /** Lanzar el recorrido solo al abrir. Es lo que manda el Asistente. */
  auto?: boolean;
}

export function SalaProspeccion({
  projectId,
  projectKind,
  projectName,
  arranque,
}: {
  projectId: string;
  projectKind: string;
  projectName: string;
  arranque?: ArranqueSala;
}) {
  const { push } = useToast();
  const objetivos = useMemo(() => objetivosDe(projectKind), [projectKind]);

  const [zona, setZona] = useState(arranque?.zona ?? '');
  const [elegidos, setElegidos] = useState<string[]>(() => {
    if (arranque?.giros?.length) return [];
    const pedido = objetivos.find((o) => o.id === arranque?.objetivo);
    return [pedido?.id ?? objetivos[0]?.id ?? ''].filter(Boolean);
  });
  const [girosLibres, setGirosLibres] = useState<string[]>(arranque?.giros ?? []);
  const [giroNuevo, setGiroNuevo] = useState('');
  const [filtros, setFiltros] = useState<FiltrosBarrido>({
    ...FILTROS_POR_OMISION,
    sinSitio: arranque?.sinSitio ?? false,
    radioM: arranque?.radioM ?? FILTROS_POR_OMISION.radioM,
  });
  const [demo, setDemo] = useState(arranque?.demo ?? false);

  const [corriendo, setCorriendo] = useState(false);
  const [lista, setLista] = useState<Prospecto[]>([]);
  const [contadores, setContadores] = useState<Contadores>(CONTADORES_VACIOS);
  const [narracion, setNarracion] = useState<string[]>([]);
  const [cuadranteActual, setCuadranteActual] = useState<{ i: number; n: number } | null>(null);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [via, setVia] = useState<'composio' | 'places' | null>(null);
  const [costoMes, setCostoMes] = useState<{ mes: number; tope: number }>({ mes: 0, tope: 0 });
  const [puedeOperar, setPuedeOperar] = useState(false);
  const [fuente, setFuente] = useState<string>('');
  const [destacado, setDestacado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  /**
   * El panel de búsqueda se pliega en cuanto arranca el recorrido.
   *
   * No es por estética: abierto mide unos 600 px y la columna entera mide ~640,
   * así que los negocios que van cayendo —que son LO que hay que mirar— quedan
   * abajo del borde y hay que scrollear para verlos. Medido en la captura del
   * 16-sep. Mientras recorre no se editan filtros; se mira.
   */
  const [panelAbierto, setPanelAbierto] = useState(true);

  const cajaMapa = useRef<HTMLDivElement | null>(null);
  const motor = useRef<Motor | null>(null);
  const corte = useRef<AbortController | null>(null);
  const limpiarPulso = useRef<(() => void) | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const yaArranco = useRef(false);

  const girosFinales = useMemo(() => {
    const deObjetivos = elegidos
      .map((id) => objetivos.find((o) => o.id === id))
      .filter((o): o is Objetivo => Boolean(o))
      .flatMap((o) => o.giros);
    return [...new Set([...deObjetivos, ...girosLibres])].slice(0, 6);
  }, [elegidos, girosLibres, objetivos]);

  const previsto = 9 * Math.max(girosFinales.length, 1) + 1;

  // ------------------------------------------------------------------ cargar
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cargar.');
      setVia(d.via ?? null);
      setCostoMes(d.costo ?? { mes: 0, tope: 0 });
      setPuedeOperar(Boolean(d.puedeOperar));
      return (d.prospectos ?? []) as Prospecto[];
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
      return [];
    }
  }, [projectId, push]);

  // -------------------------------------------------------------- el mapa
  useEffect(() => {
    let vivo = true;
    let motorLocal: Motor | null = null;

    void (async () => {
      const previos = await cargar();
      if (!vivo || !cajaMapa.current) return;
      const conCoords = previos.filter((p) => p.lat !== null && p.lng !== null);
      // El mapa nace donde ya hay trabajo hecho. Abrir siempre en el Zócalo a un
      // usuario que lleva tres recorridos de Tulum es decirle que la pantalla no
      // se acuerda de él.
      const centro = conCoords.length
        ? {
            lat: conCoords.reduce((s, p) => s + p.lat!, 0) / conCoords.length,
            lng: conCoords.reduce((s, p) => s + p.lng!, 0) / conCoords.length,
          }
        : CENTRO_DE_ARRANQUE;

      const { crearMotor } = await import('./mapa-motor');
      if (!vivo || !cajaMapa.current) return;
      motorLocal = await crearMotor(cajaMapa.current, centro, conCoords.length ? 4000 : 40_000);
      if (!vivo) {
        motorLocal.destruir();
        return;
      }
      motor.current = motorLocal;
      setFuente(motorLocal.fuente);
      for (const p of conCoords) {
        motorLocal.marcar({
          id: p.id,
          punto: { lat: p.lat!, lng: p.lng! },
          titulo: p.name,
          tono: p.status === 'convertido' ? 'convertido' : p.website ? 'apagado' : 'oportunidad',
        });
      }
    })();

    return () => {
      vivo = false;
      motorLocal?.destruir();
      motor.current = null;
    };
  }, [cargar]);

  // El mapa mide su lienzo al nacer. Entrar o salir de pantalla completa cambia
  // la caja debajo de él y sin este aviso se queda pintando en el tamaño viejo:
  // teselas cortadas y marcadores corridos.
  useEffect(() => {
    const t = setTimeout(() => motor.current?.remedir(), 240);
    return () => clearTimeout(t);
  }, [demo]);

  useEffect(() => {
    motor.current?.destacar(destacado);
  }, [destacado]);

  useEffect(() => {
    if (!demo) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDemo(false);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [demo]);

  const decir = useCallback((texto: string) => {
    // Diez líneas y no el historial entero: en el modo Demo el panel se lee de
    // lejos y una lista larga obliga a buscar cuál es la de ahorita.
    setNarracion((prev) => [...prev.slice(-9), texto]);
  }, []);

  useEffect(() => {
    panel.current?.scrollTo({ top: panel.current.scrollHeight, behavior: 'smooth' });
  }, [narracion]);

  // ---------------------------------------------------------------- recorrer
  const recorrer = useCallback(async () => {
    if (corriendo) return;
    if (zona.trim().length < 3) {
      push({ title: 'Dime la zona: "Tulum", "Playa del Carmen centro"', variant: 'error' });
      return;
    }
    if (girosFinales.length === 0) {
      push({ title: 'Marca al menos un objetivo o escribe un giro.', variant: 'error' });
      return;
    }

    setCorriendo(true);
    setPanelAbierto(false);
    setLista([]);
    setResumen(null);
    setNarracion([]);
    setContadores(CONTADORES_VACIOS);
    setCuadranteActual(null);
    apagarPulso(limpiarPulso);

    const control = new AbortController();
    corte.current = control;
    let cuadris: Cuadrante[] = [];

    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion/barrido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: control.signal,
        body: JSON.stringify({
          zona: zona.trim(),
          giros: girosFinales,
          filtros,
          lado: 3,
          paginas: 1,
          demo,
          enriquecer: 8,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `El recorrido no arrancó (${res.status}).`);
      }

      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      let pendiente = '';

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        // Las tramas de SSE se separan con una línea en blanco. El último trozo
        // se guarda sin tocar porque casi siempre llega partido a la mitad: la
        // red corta por bytes, no por eventos.
        const tramas = pendiente.split('\n\n');
        pendiente = tramas.pop() ?? '';
        for (const trama of tramas) {
          const linea = trama.split('\n').find((l) => l.startsWith('data:'));
          if (!linea) continue;
          let evento: any;
          try {
            evento = JSON.parse(linea.slice(5).trim());
          } catch {
            continue;
          }
          await atender(evento);
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        push({ title: e instanceof Error ? e.message : 'El recorrido falló', variant: 'error' });
        decir(`✗ ${e instanceof Error ? e.message : 'El recorrido falló.'}`);
      }
    } finally {
      limpiarPulso.current?.();
      limpiarPulso.current = null;
      setCuadranteActual(null);
      setCorriendo(false);
      corte.current = null;
      void cargar();
    }

    async function atender(e: any) {
      switch (e.tipo) {
        case 'inicio': {
          cuadris = e.cuadrantes as Cuadrante[];
          decir(e.texto);
          await motor.current?.volarA(e.centro, e.radioM, demo ? 1600 : 700);
          break;
        }
        case 'cuadrante': {
          setCuadranteActual({ i: e.i, n: e.n });
          decir(e.texto);
          limpiarPulso.current?.();
          await motor.current?.volarA(e.cuadrante.centro, e.cuadrante.radioM, demo ? 1400 : 550);
          limpiarPulso.current = motor.current?.pulsar(e.cuadrante) ?? null;
          break;
        }
        case 'negocio': {
          const p = e.prospecto as Prospecto;
          setLista((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
          setContadores(e.contadores);
          if (p.lat !== null && p.lng !== null) {
            motor.current?.marcar({
              id: p.id,
              punto: { lat: p.lat, lng: p.lng },
              titulo: p.name,
              tono: p.website ? 'nuevo' : 'oportunidad',
            });
          }
          break;
        }
        case 'cuadranteListo':
          decir(e.texto);
          break;
        case 'fase':
          decir(e.texto);
          if (e.fase === 'enriquecimiento') {
            limpiarPulso.current?.();
            limpiarPulso.current = null;
            const caja = cajaDeTodos(cuadris);
            if (caja) motor.current?.encuadrar(caja, demo ? 1400 : 600);
          }
          break;
        case 'leyendo':
          setLeyendo(e.prospectId);
          setDestacado(e.prospectId);
          decir(e.texto);
          break;
        case 'leido':
          setLeyendo(null);
          setContadores(e.contadores);
          setLista((prev) =>
            prev.map((p) => (p.id === e.prospectId ? { ...p, enrichment: e.enrichment } : p)),
          );
          decir(e.texto);
          break;
        case 'fuera':
          setLista((prev) => prev.filter((p) => p.id !== e.prospectId));
          motor.current?.quitarMarcador(e.prospectId);
          break;
        case 'aviso':
          decir(`· ${e.texto}`);
          break;
        case 'resumen': {
          setResumen(e as Resumen);
          setCostoMes({ mes: e.costo.mes, tope: e.costo.tope });
          decir(e.texto);
          const caja = cajaDeTodos(cuadris);
          if (caja) motor.current?.encuadrar(caja, demo ? 1600 : 700);
          break;
        }
        case 'error':
          decir(`✗ ${e.mensaje}`);
          push({ title: e.mensaje, variant: 'error' });
          break;
        default:
          break;
      }
    }
  }, [corriendo, zona, girosFinales, filtros, demo, projectId, push, decir, cargar]);

  function detener() {
    corte.current?.abort();
  }

  // ------------------------------------------------------------- el desenlace
  async function lote(accion: 'convertir-lote' | 'encolar-lote', ids: string[]) {
    if (ids.length === 0) {
      push({ title: 'No hay a quién mandar con esos filtros.', variant: 'error' });
      return;
    }
    setTrabajando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo.');
      push({
        title:
          accion === 'convertir-lote'
            ? `${d.hechos} de ${d.pedidos} convertidos a lead`
            : `${d.hechos} de ${d.pedidos} en la cola, esperando tu visto bueno`,
        variant: 'success',
      });
      void cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(false);
    }
  }

  const sinSitioIds = lista.filter((p) => !p.website).map((p) => p.id);

  // Arranque automático: es el camino del Asistente ("busca restaurantes sin
  // sitio web en Tulum" abre esta pantalla y la corre). El candado de `ref` es
  // porque en desarrollo React monta dos veces, y sin él el primer clic del
  // usuario serían dos recorridos cobrados.
  useEffect(() => {
    if (!arranque?.auto || yaArranco.current) return;
    if (!puedeOperar || !zona || girosFinales.length === 0) return;
    yaArranco.current = true;
    const t = setTimeout(() => void recorrer(), 600);
    return () => clearTimeout(t);
  }, [arranque?.auto, puedeOperar, zona, girosFinales.length, recorrer]);

  // ---------------------------------------------------------------- pintura
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        demo
          ? 'fixed inset-0 z-[70] bg-[var(--color-background)] p-3'
          : 'h-[calc(100vh-13rem)] min-h-[560px]',
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .goossip-pin{width:18px;height:18px;display:grid;place-items:center;cursor:pointer}
        .goossip-pin-punto{width:12px;height:12px;border-radius:9999px;background:var(--pin);
          box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.35);
          animation:goossip-cae .45s cubic-bezier(.2,1.4,.4,1) both}
        .goossip-pin.es-destacado .goossip-pin-punto{transform:scale(1.7);transition:transform .2s}
        @keyframes goossip-cae{0%{transform:translateY(-18px) scale(.4);opacity:0}
          60%{transform:translateY(2px) scale(1.15);opacity:1}100%{transform:none;opacity:1}}
        /* El punto del centro va FIJO y el anillo aparte. Si el anillo fuera el
           elemento de afuera, su opacity:0 del final se heredaria al punto y
           el cuadrante que se esta revisando desapareceria medio ciclo de cada
           ciclo, justo cuando alguien toma la captura. */
        .goossip-pulso{position:relative;width:14px;height:14px;border-radius:9999px;
          background:#1d4ed8;box-shadow:0 0 0 3px rgba(255,255,255,.9)}
        .goossip-anillo{position:absolute;left:50%;top:50%;width:34px;height:34px;
          margin:-17px 0 0 -17px;border-radius:9999px;border:3px solid #1d4ed8;
          animation:goossip-pulsa 1.5s ease-out infinite}
        @keyframes goossip-pulsa{0%{transform:scale(.4);opacity:.95}100%{transform:scale(3);opacity:0}}
        .goossip-tarjeta{animation:goossip-entra .35s ease-out both}
        @keyframes goossip-entra{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){
          .goossip-pin-punto,.goossip-anillo,.goossip-tarjeta{animation:none!important}}
      `,
        }}
      />

      {/* ------------------------------------------------------------ arriba */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          Sala de Prospección
          <span className="ml-2 font-normal text-[var(--color-muted-foreground)]">{projectName}</span>
        </h2>
        <Badge variant="outline" className="text-[10px]">
          {costoMes.mes} de {costoMes.tope} búsquedas este mes
        </Badge>
        {via === 'composio' && (
          <Badge variant="outline" className="text-[10px]">
            consumo en tu cuenta de Google
          </Badge>
        )}
        {via === 'places' && (
          <Badge variant="outline" className="text-[10px]">
            consumo en la cuenta de Goossip
          </Badge>
        )}
        {via === null && (
          <Badge variant="outline" className="border-[var(--color-destructive)] text-[10px] text-[var(--color-destructive)]">
            sin Google Maps conectado
          </Badge>
        )}
        {fuente && (
          <Badge variant="outline" className="text-[10px]">
            mapa: {fuente}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDemo((d) => !d)}
            className={cn(
              'h-8 rounded-md border px-3 text-xs transition-colors',
              demo
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
            )}
          >
            {demo ? 'Salir de Presentación (Esc)' : 'Modo Presentación'}
          </button>
          {!demo && (
            <Link
              href={`/projects/${projectId}/leads?vista=prospeccion`}
              className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-3 text-xs hover:bg-[var(--color-accent)]"
            >
              Ver la lista completa
            </Link>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ------------------------------------------------- columna izquierda */}
        {!demo && (
          <aside className="flex w-[360px] shrink-0 flex-col gap-3 pr-1">
            {!panelAbierto && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {zona || 'sin zona'} · {girosFinales.join(', ') || 'sin giro'}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {filtrosEnPalabras(filtros).join(' · ')}
                  </p>
                </div>
                {corriendo ? (
                  <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={detener}>
                    Detener
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    onClick={() => setPanelAbierto(true)}
                  >
                    Cambiar
                  </Button>
                )}
              </div>
            )}
            <div
              className={cn(
                'space-y-3 rounded-lg border border-[var(--color-border)] p-3',
                !panelAbierto && 'hidden',
              )}
            >
              <div>
                <label className="mb-1 block text-xs font-medium">Zona</label>
                <Input
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void recorrer()}
                  placeholder="Tulum · Playa del Carmen centro"
                  disabled={!puedeOperar || corriendo}
                />
              </div>

              <div>
                <p className="mb-1 text-xs font-medium">A quién le vendes</p>
                <div className="flex flex-wrap gap-1.5">
                  {objetivos.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      title={o.porque}
                      disabled={corriendo}
                      onClick={() =>
                        setElegidos((prev) =>
                          prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
                        )
                      }
                      className={cn(
                        'rounded-md border px-2 py-1 text-[11px] transition-colors',
                        elegidos.includes(o.id)
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={giroNuevo}
                    onChange={(e) => setGiroNuevo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || giroNuevo.trim().length < 3) return;
                      e.preventDefault();
                      setGirosLibres((prev) => [...new Set([...prev, giroNuevo.trim()])]);
                      setGiroNuevo('');
                    }}
                    placeholder="o escribe un giro y Enter"
                    className="h-8 text-xs"
                    disabled={corriendo}
                  />
                </div>
                {girosLibres.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {girosLibres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGirosLibres((prev) => prev.filter((x) => x !== g))}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-1 text-[11px] text-[var(--color-primary)]"
                      >
                        {g} <IconX className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium">
                  <span>Radio</span>
                  <span className="text-[var(--color-muted-foreground)]">
                    {(filtros.radioM / 1000).toFixed(1)} km
                  </span>
                </label>
                <input
                  type="range"
                  min={500}
                  max={15000}
                  step={500}
                  value={filtros.radioM}
                  disabled={corriendo}
                  onChange={(e) => setFiltros({ ...filtros, radioM: Number(e.target.value) })}
                  className="w-full accent-[var(--color-primary)]"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Filtro
                  activo={filtros.sinSitio}
                  onClick={() => setFiltros({ ...filtros, sinSitio: !filtros.sinSitio })}
                >
                  sin sitio web
                </Filtro>
                <Filtro
                  activo={filtros.conWhatsapp}
                  onClick={() => setFiltros({ ...filtros, conWhatsapp: !filtros.conWhatsapp })}
                >
                  con WhatsApp
                </Filtro>
                <Filtro
                  activo={filtros.abiertosAhora}
                  onClick={() => setFiltros({ ...filtros, abiertosAhora: !filtros.abiertosAhora })}
                >
                  abiertos ahora
                </Filtro>
                <Filtro
                  activo={filtros.ratingMin > 0}
                  onClick={() =>
                    setFiltros({ ...filtros, ratingMin: filtros.ratingMin > 0 ? 0 : 4 })
                  }
                >
                  rating 4+
                </Filtro>
                <Filtro
                  activo={filtros.minResenas > 0}
                  onClick={() =>
                    setFiltros({ ...filtros, minResenas: filtros.minResenas > 0 ? 0 : 20 })
                  }
                >
                  20+ reseñas
                </Filtro>
                <Filtro
                  activo={filtros.horarios}
                  onClick={() => setFiltros({ ...filtros, horarios: !filtros.horarios })}
                  titulo="Pide los horarios a Google. Ese campo lo cobra en un tramo más caro."
                >
                  horarios (+$)
                </Filtro>
              </div>

              {corriendo ? (
                <Button variant="outline" className="w-full" onClick={detener}>
                  Detener el recorrido
                </Button>
              ) : (
                <Button
                  className="btn-brand w-full"
                  disabled={!puedeOperar || via === null}
                  onClick={() => void recorrer()}
                >
                  Recorrer la zona
                </Button>
              )}
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {girosFinales.length === 0
                  ? 'Marca un objetivo para empezar.'
                  : `9 cuadrantes × ${girosFinales.length} ${
                      girosFinales.length === 1 ? 'giro' : 'giros'
                    } = hasta ${previsto} búsquedas de tus ${costoMes.tope} del mes · ${filtrosEnPalabras(
                      filtros,
                    ).join(' · ')}`}
              </p>
              {via === null && (
                <p className="text-[11px] text-[var(--color-destructive)]">
                  Conecta Google Maps en Conexiones del proyecto para poder recorrer.
                </p>
              )}
            </div>

            {/* ------------------------------------------------ los que caen */}
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="font-medium">{lineaDeContadores(contadores)}</span>
            </div>

            {/*
              `min-h-0 flex-1 overflow-y-auto`: el scroll vive AQUÍ y no en la
              columna entera. Así el resumen de la búsqueda y el contador se
              quedan clavados arriba mientras los negocios caen, en vez de
              irse subiendo conforme crece la lista.
            */}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {lista.length === 0 && !corriendo && (
                <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                  Escribe una zona, marca a quién le vendes y dale «Recorrer la zona». Goossip va a
                  ir cuadrante por cuadrante y los negocios van a ir cayendo aquí.
                </p>
              )}
              {lista.map((p) => (
                <Tarjeta
                  key={p.id}
                  p={p}
                  leyendo={leyendo === p.id}
                  onHover={() => setDestacado(p.id)}
                  onLeave={() => setDestacado(null)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* ---------------------------------------------------------- el mapa */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--color-border)]">
          {/*
            `h-full w-full` y NO `absolute inset-0`, y el motivo está medido.
            MapLibre le pega al contenedor su propia clase `maplibregl-map`, y
            esa clase trae `position: relative`. Su hoja de estilo entra después
            de la de Tailwind, así que con la misma especificidad **gana ella**:
            el `absolute` se apaga, el `inset-0` deja de dimensionar y el div
            queda de 1438 × 0. El síntoma era el peor de todos —las teselas
            bajaban con HTTP 200, el canvas existía, no había un solo error en
            consola y el mapa se veía en blanco—. Con alto y ancho al 100 % no
            importa qué posición le ponga encima la librería.
          */}
          <div ref={cajaMapa} className="h-full w-full" />

          {/* contador en vivo, encima del mapa */}
          <div className="pointer-events-none absolute left-3 top-3 space-y-2">
            <div className="rounded-lg bg-[var(--color-background)]/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
              <p className={cn('font-semibold', demo && 'text-base')}>
                {lineaDeContadores(contadores)}
              </p>
              {cuadranteActual && (
                <p className="text-[var(--color-muted-foreground)]">
                  cuadrante {cuadranteActual.i} de {cuadranteActual.n}
                </p>
              )}
            </div>
            {demo && (
              <div className="rounded-lg bg-[var(--color-background)]/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
                <p className="font-medium">{zona || 'sin zona'}</p>
                <p className="text-[var(--color-muted-foreground)]">
                  {girosFinales.join(' · ') || '—'}
                </p>
              </div>
            )}
          </div>

          {demo && (
            <button
              type="button"
              onClick={() => setDemo(false)}
              className="absolute right-3 top-3 inline-flex h-8 items-center gap-1 rounded-md bg-[var(--color-background)]/90 px-3 text-xs shadow-sm backdrop-blur"
            >
              <IconX className="h-3.5 w-3.5" /> salir
            </button>
          )}

          {/* la narración */}
          {(narracion.length > 0 || corriendo) && (
            <div
              ref={panel}
              className={cn(
                'absolute bottom-3 left-3 right-3 max-h-40 overflow-y-auto rounded-lg bg-[var(--color-background)]/92 p-3 shadow-sm backdrop-blur',
                demo && 'left-1/2 right-auto max-h-48 w-[min(760px,88vw)] -translate-x-1/2',
              )}
            >
              {narracion.map((l, i) => (
                <p
                  key={`${i}-${l.slice(0, 12)}`}
                  className={cn(
                    'leading-snug',
                    demo ? 'text-sm' : 'text-xs',
                    i === narracion.length - 1
                      ? 'font-medium'
                      : 'text-[var(--color-muted-foreground)]',
                  )}
                >
                  {l}
                </p>
              ))}
              {corriendo && narracion.length === 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)]">Abriendo el mapa…</p>
              )}
            </div>
          )}

          {/* el resumen del final */}
          {resumen && !corriendo && (
            <div
              className={cn(
                'absolute right-3 top-3 w-[300px] space-y-2 rounded-lg bg-[var(--color-background)]/95 p-3 shadow-lg backdrop-blur',
                demo && 'right-3 top-14 w-[340px]',
              )}
            >
              <p className="text-sm font-semibold">Lo que encontré</p>
              <ul className="space-y-1 text-xs">
                {resumen.hallazgos.map((h) => (
                  <li key={h} className="flex gap-1.5">
                    <span className="text-[var(--color-primary)]">•</span> {h}
                  </li>
                ))}
                {resumen.hallazgos.length === 0 && (
                  <li className="text-[var(--color-muted-foreground)]">
                    Nada que señalar: todos con sitio y bien calificados.
                  </li>
                )}
              </ul>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {resumen.costo.hechas} búsquedas · llevas {resumen.costo.mes} de{' '}
                {resumen.costo.tope} este mes
              </p>
              {puedeOperar && resumen.total > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    className="btn-brand h-8 text-xs"
                    disabled={trabajando}
                    onClick={() => void lote('encolar-lote', sinSitioIds.slice(0, 50))}
                  >
                    Mándalos a la cola ({Math.min(sinSitioIds.length, 50)} sin sitio)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={trabajando}
                    onClick={() => void lote('convertir-lote', lista.slice(0, 50).map((p) => p.id))}
                  >
                    Convertir a leads ({Math.min(lista.length, 50)})
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Filtro({
  activo,
  onClick,
  titulo,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] transition-colors',
        activo
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      {children}
    </button>
  );
}

function Tarjeta({
  p,
  leyendo,
  onHover,
  onLeave,
}: {
  p: Prospecto;
  leyendo: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const e = p.enrichment ?? {};
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'goossip-tarjeta rounded-lg border p-2 text-xs',
        p.website
          ? 'border-[var(--color-border)]'
          : 'border-amber-500/60 bg-amber-500/5',
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        {p.mapsUrl ? (
          <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">
            {p.name}
          </a>
        ) : (
          <span className="truncate">{p.name}</span>
        )}
        {p.rating !== null && (
          <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
            ★ {p.rating}
            {p.ratingsCount ? ` (${p.ratingsCount})` : ''}
          </span>
        )}
      </p>
      <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
        {[p.category, p.address].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        {p.phone && (
          <span className="inline-flex items-center gap-1">
            <IconPhone className="h-3 w-3" /> {p.phone}
          </span>
        )}
        {!p.website && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <IconTarget className="h-3 w-3" /> sin sitio web
          </span>
        )}
        {p.website && !leyendo && !e.leido && (
          <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
            <IconGlobe className="h-3 w-3" /> con sitio
          </span>
        )}
        {leyendo && (
          <span className="inline-flex items-center gap-1 text-[var(--color-primary)]">
            <IconGlobe className="h-3 w-3 animate-pulse" /> leyendo su sitio…
          </span>
        )}
        {e.email && (
          <span className="inline-flex items-center gap-1 truncate text-[var(--color-success)]">
            <IconMail className="h-3 w-3" /> {e.email}
          </span>
        )}
        {e.whatsapp && (
          <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
            <IconWhatsApp className="h-3 w-3" /> {e.whatsapp}
          </span>
        )}
        {e.redes &&
          Object.keys(e.redes).map((red) => (
            <span key={red} className="text-[var(--color-muted-foreground)]">
              {red}
            </span>
          ))}
        {e.leido && !e.email && !e.whatsapp && (
          <span className="text-[var(--color-muted-foreground)]">su sitio no publica contacto</span>
        )}
      </div>
    </div>
  );
}
