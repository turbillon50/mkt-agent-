'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatosDeLaSala,
  formatosDelVisor,
  vistaPrevia,
  type AutorLinkedin,
  type Chrome,
  type FormatoDelVisor,
} from '@/src/creative/visor';
import { RED_LABEL, type RedSlug } from '@/src/creative/specs';

/**
 * El visor FIEL por red: cómo se va a ver la pieza EN CADA RED, antes de
 * publicarla.
 *
 * Cuatro decisiones que hacen que esto sirva para aprobar y no solo para
 * adornar:
 *
 *   1. **El recorte es real.** Cada marco tiene la proporción exacta de la spec
 *      oficial y la imagen entra con `object-cover`, que es lo que hace la red:
 *      si la pieza es 4:5 y el marco es 9:16, aquí se ve lo que se va a perder.
 *      Un visor que estira la imagen para que quepa enseña una mentira bonita.
 *   2. **El texto se corta donde lo corta la red.** Lo que queda detrás del
 *      "ver más" se pinta apagado, no se esconde: el cliente tiene que ver
 *      exactamente qué mitad de su mensaje nadie va a leer. Y lo que SOBRA del
 *      tope —lo que la red no va a aceptar— va tachado en rojo, que es otra
 *      cosa distinta.
 *   3. **La zona segura se DIBUJA.** En historias y reels, las bandas donde la
 *      red encima sus botones van rayadas sobre la imagen, con la interfaz de
 *      la red encima. Decir "269 px arriba" no le dice nada a nadie; ver el
 *      titular debajo de la barra de Instagram, sí.
 *   4. **Cada red se pinta como es.** Facebook con su barra de reacciones,
 *      Instagram con su fila de iconos y su "Me gusta a N personas", X con su
 *      hilo y sus contadores, TikTok con su columna de botones, YouTube con su
 *      duración encima de la miniatura y su canal debajo, Messenger con su
 *      burbuja. Una tarjeta genérica con el logo de la red arriba no enseña si
 *      el titular se va a leer.
 *
 * Ni un número de píxeles está escrito aquí: todos vienen de `specs.ts`, que
 * los trae con su fuente oficial y su fecha de lectura, y de `cortes.ts`, que
 * dice además cuáles de esos números publica la red y cuáles no.
 */

export interface PiezaParaVisor {
  id: string;
  url: string | null;
  red: string;
  formato: string;
  brief: string;
}

const CHROME: Record<string, { fondo: string; texto: string; tenue: string; fuente: string }> = {
  facebook: {
    fondo: 'bg-white dark:bg-[#242526]',
    texto: 'text-[#050505] dark:text-[#e4e6eb]',
    tenue: 'text-[#65676b] dark:text-[#b0b3b8]',
    fuente: 'font-[system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif]',
  },
  instagram: {
    fondo: 'bg-white dark:bg-black',
    texto: 'text-black dark:text-white',
    tenue: 'text-[#737373] dark:text-[#a8a8a8]',
    fuente: 'font-[system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif]',
  },
  linkedin: {
    fondo: 'bg-white dark:bg-[#1b1f23]',
    texto: 'text-[#000000e6] dark:text-white',
    tenue: 'text-[#00000099] dark:text-[#ffffffb3]',
    fuente: 'font-[-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif]',
  },
  twitter: {
    fondo: 'bg-white dark:bg-black',
    texto: 'text-[#0f1419] dark:text-[#e7e9ea]',
    tenue: 'text-[#536471] dark:text-[#71767b]',
    fuente: 'font-[-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif]',
  },
  tiktok: {
    fondo: 'bg-black',
    texto: 'text-white',
    tenue: 'text-white/70',
    fuente: 'font-[-apple-system,"Segoe UI",Roboto,sans-serif]',
  },
  youtube: {
    fondo: 'bg-white dark:bg-[#0f0f0f]',
    texto: 'text-[#0f0f0f] dark:text-white',
    tenue: 'text-[#606060] dark:text-[#aaaaaa]',
    fuente: 'font-[Roboto,Arial,sans-serif]',
  },
};

export function PreviewRed({
  pieza,
  texto,
  proyecto,
  logo,
  /** Enseñar solo los lienzos de esta red. Sin esto, salen los 19. */
  soloRed,
  /** Qué lienzo abrir. Sin esto, el de la propia pieza. */
  formatoInicial,
  onFormato,
}: {
  pieza: PiezaParaVisor;
  texto: string;
  proyecto: string;
  logo?: string | null;
  soloRed?: RedSlug | null;
  formatoInicial?: string | null;
  onFormato?: (formatoId: string) => void;
}) {
  const formatos = useMemo(
    () => (soloRed ? formatosDeLaSala(soloRed) : formatosDelVisor()),
    [soloRed],
  );
  const [activo, setActivo] = useState<string>(
    // Arranca en el formato de la propia pieza si está en la lista; si no, en el
    // primero. Abrir el visor en la red equivocada obliga a un clic que nadie
    // debería tener que dar.
    formatoInicial ??
      formatos.find((f) => f.id === pieza.formato)?.id ??
      formatos[0]?.id ??
      '',
  );
  const [autorLinkedin, setAutorLinkedin] = useState<AutorLinkedin>('pagina');

  const formato = formatos.find((f) => f.id === activo) ?? formatos[0]!;
  const previa = vistaPrevia({ red: formato.red, formatoId: formato.id, texto });
  const chrome = CHROME[formato.red] ?? CHROME.facebook!;

  const elegir = (id: string) => {
    setActivo(id);
    onFormato?.(id);
  };

  return (
    <div className="space-y-3">
      {/* -------------------------------------------------------- las pestañas */}
      <div className="flex flex-wrap gap-1.5">
        {formatos.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => elegir(f.id)}
            title={`${f.label} · ${f.ancho} × ${f.alto} px (${f.ratio})`}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              f.id === activo
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
            )}
          >
            {soloRed ? f.corto : `${f.redLabel} · ${f.corto}`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- el simulacro */}
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-[var(--color-border)] shadow-sm',
            chrome.fondo,
            chrome.fuente,
          )}
          data-visor-marco={formato.id}
        >
          <Marco
            formato={formato}
            previa={previa}
            chrome={chrome}
            pieza={pieza}
            proyecto={proyecto}
            logo={logo ?? null}
            texto={texto}
            autorLinkedin={autorLinkedin}
            setAutorLinkedin={setAutorLinkedin}
          />
        </div>

        {/* --------------------------------------------------------- los avisos */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {formato.ancho} × {formato.alto} px ({formato.ratio})
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                previa.seExcede
                  ? 'border-[var(--color-destructive)]/60 text-[var(--color-destructive)]'
                  : previa.cortado
                    ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                    : '',
              )}
            >
              {previa.caracteres}
              {previa.tope !== null ? ` / ${previa.tope}` : ''} caracteres
              {previa.limite !== null && previa.limite !== previa.tope
                ? ` · se ven ${previa.limite}`
                : ''}
            </Badge>
            {previa.hashtags.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {previa.hashtags.length} hashtags
              </Badge>
            )}
            {previa.menciones.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {previa.menciones.length} menciones
              </Badge>
            )}
          </div>

          <ul className="space-y-1.5">
            {previa.avisos.map((a, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md border-l-2 bg-[var(--color-accent)]/30 py-1.5 pl-2.5 pr-2 text-[11px] leading-snug',
                  a.severidad === 'error'
                    ? 'border-l-[var(--color-destructive)]'
                    : a.severidad === 'aviso'
                      ? 'border-l-amber-500'
                      : 'border-l-[var(--color-border)]',
                )}
              >
                {a.texto}
              </li>
            ))}
          </ul>

          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Medidas de {RED_LABEL[formato.red as RedSlug]} tomadas de{' '}
            <a href={formato.fuente} target="_blank" rel="noreferrer" className="underline">
              su documentación oficial
            </a>{' '}
            el {formato.leidoEl}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los marcos, uno por forma de pintar
// ---------------------------------------------------------------------------

type Previa = ReturnType<typeof vistaPrevia>;
type Chromes = (typeof CHROME)[string];

interface MarcoProps {
  formato: FormatoDelVisor;
  previa: Previa;
  chrome: Chromes;
  pieza: PiezaParaVisor;
  proyecto: string;
  logo: string | null;
  texto: string;
  autorLinkedin: AutorLinkedin;
  setAutorLinkedin: (a: AutorLinkedin) => void;
}

function Marco(p: MarcoProps) {
  switch (p.formato.chrome as Chrome) {
    case 'historia':
    case 'reel':
      return <MarcoPantallaCompleta {...p} />;
    case 'miniatura':
      return <MarcoMiniatura {...p} />;
    case 'burbuja':
      return <MarcoBurbuja {...p} />;
    case 'hilo':
      return <MarcoHilo {...p} />;
    case 'documento':
      return <MarcoDocumento {...p} />;
    case 'carrusel':
      return <MarcoMuro {...p} carrusel />;
    default:
      return <MarcoMuro {...p} />;
  }
}

/** La firma: avatar (o inicial), nombre y la línea de debajo. */
function Cabecera({
  proyecto,
  logo,
  chrome,
  sub,
  redondo = true,
}: {
  proyecto: string;
  logo: string | null;
  chrome: Chromes;
  sub: string;
  redondo?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className={cn('h-8 w-8 object-cover', redondo ? 'rounded-full' : 'rounded')}
        />
      ) : (
        <span
          className={cn(
            'grid h-8 w-8 place-items-center bg-[var(--color-primary)] text-[12px] font-bold text-[var(--color-primary-foreground)]',
            redondo ? 'rounded-full' : 'rounded',
          )}
        >
          {proyecto.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[13px] font-semibold leading-tight', chrome.texto)}>
          {proyecto}
        </p>
        <p className={cn('text-[11px] leading-tight', chrome.tenue)}>{sub}</p>
      </div>
      <span className={cn('text-lg leading-none', chrome.tenue)} aria-hidden>
        ⋯
      </span>
    </div>
  );
}

/**
 * El texto con sus dos cortes.
 *
 * Lo VISIBLE en negro. Lo que está detrás del "ver más", apagado — se publica,
 * nadie lo lee. Y lo que SOBRA del tope de la red, tachado en rojo: eso ni
 * siquiera se publica. Son tres estados y pintarlos igual era el bug.
 */
function Texto({ previa, chrome, clase }: { previa: Previa; chrome: Chromes; clase?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap px-3 pb-2 text-[13px] leading-[1.35]', chrome.texto, clase)}>
      {previa.visible}
      {previa.cortado && (
        <>
          <span className={cn('font-medium', chrome.tenue)}>
            {'… '}
            {previa.corte.etiquetaVerMas || 'ver más'}
          </span>
          <span className={cn('block pt-1 opacity-50', chrome.tenue)}>
            {previa.oculto.slice(0, 220)}
            {previa.oculto.length > 220 ? '…' : ''}
          </span>
        </>
      )}
      {previa.seExcede && (
        <span className="block pt-1 text-[var(--color-destructive)] line-through">
          {previa.sobrante.slice(0, 160)}
          {previa.sobrante.length > 160 ? '…' : ''}
        </span>
      )}
    </p>
  );
}

/** El lienzo con la imagen recortada como la recorta la red. */
function Lienzo({
  formato,
  previa,
  pieza,
  children,
}: {
  formato: FormatoDelVisor;
  previa: Previa;
  pieza: PiezaParaVisor;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative w-full bg-[var(--color-accent)]"
      style={{ aspectRatio: `${formato.ancho} / ${formato.alto}` }}
      data-visor-lienzo={formato.id}
    >
      {pieza.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pieza.url}
          alt={pieza.brief}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-[var(--color-muted-foreground)]">
          sin imagen
        </div>
      )}

      {/* la zona segura, dibujada */}
      {(previa.zonaSegura.arriba > 0 || previa.zonaSegura.abajo > 0) && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.42)_0_6px,transparent_6px_12px)]"
            style={{ height: `${(previa.zonaSegura.arriba / formato.alto) * 100}%` }}
            title={`${previa.zonaSegura.arriba} px que la red tapa con su interfaz`}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.42)_0_6px,transparent_6px_12px)]"
            style={{ height: `${(previa.zonaSegura.abajo / formato.alto) * 100}%` }}
            title={`${previa.zonaSegura.abajo} px que la red tapa con sus botones`}
          />
        </>
      )}
      {children}
    </div>
  );
}

// --- muro (Facebook, Instagram, LinkedIn) -----------------------------------

function MarcoMuro(p: MarcoProps & { carrusel?: boolean }) {
  const { formato, previa, chrome } = p;
  const red = formato.red;

  const sub =
    red === 'linkedin'
      ? p.autorLinkedin === 'pagina'
        ? '1 234 seguidores · Publicación de la página'
        : 'Fundador · 1.er grado'
      : red === 'instagram'
        ? 'Ciudad de México'
        : 'Hace 12 min · 🌎';

  return (
    <>
      <Cabecera proyecto={p.proyecto} logo={p.logo} chrome={chrome} sub={sub} />

      {/* Instagram pone el texto DEBAJO de la imagen; Facebook y LinkedIn, encima. */}
      {red !== 'instagram' && <Texto previa={previa} chrome={chrome} />}

      <Lienzo formato={formato} previa={previa} pieza={p.pieza}>
        {p.carrusel && <PuntosDeCarrusel />}
      </Lienzo>

      {/* el pie del enlace, que Facebook y LinkedIn pintan bajo la imagen */}
      {formato.id === 'facebook-enlace' && (
        <div className={cn('border-t border-black/5 px-3 py-2 dark:border-white/10')}>
          <p className={cn('text-[10px] uppercase tracking-wide', chrome.tenue)}>
            {p.proyecto.toLowerCase().replace(/\s+/g, '')}.com
          </p>
          <p className={cn('truncate text-[13px] font-semibold', chrome.texto)}>
            {(p.texto.split('\n')[0] || 'Sin título').slice(0, formato.ancho === 1200 ? 27 : 40)}
          </p>
        </div>
      )}

      <BarraDeAcciones red={red} chrome={chrome} />

      {red === 'linkedin' && (
        <div className="flex gap-1 px-3 pb-2">
          {(['pagina', 'persona'] as AutorLinkedin[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => p.setAutorLinkedin(a)}
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px]',
                p.autorLinkedin === a
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
              )}
            >
              como {a}
            </button>
          ))}
        </div>
      )}

      {red === 'instagram' && <Texto previa={previa} chrome={chrome} clase="pt-1" />}
    </>
  );
}

function PuntosDeCarrusel() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn('h-1.5 w-1.5 rounded-full', i === 0 ? 'bg-white' : 'bg-white/45')}
        />
      ))}
    </div>
  );
}

/**
 * La barra de reacciones. Cada red pone la suya y en su sitio, porque es lo que
 * decide cuánto espacio le queda al texto en pantalla.
 */
function BarraDeAcciones({ red, chrome }: { red: RedSlug; chrome: Chromes }) {
  if (red === 'instagram') {
    return (
      <div className="space-y-1 px-3 pt-2">
        <div className={cn('flex items-center gap-3.5 text-[17px]', chrome.texto)} aria-hidden>
          <span>♡</span>
          <span>💬</span>
          <span>➤</span>
          <span className="ml-auto">🔖</span>
        </div>
        <p className={cn('text-[12px] font-semibold', chrome.texto)}>Me gusta a 128 personas</p>
      </div>
    );
  }
  if (red === 'facebook') {
    return (
      <>
        <div className={cn('flex items-center justify-between px-3 py-1.5 text-[11px]', chrome.tenue)}>
          <span>👍❤️ 214</span>
          <span>18 comentarios · 6 veces compartido</span>
        </div>
        <div
          className={cn(
            'flex items-center justify-around border-t border-black/5 py-1.5 text-[12px] font-medium dark:border-white/10',
            chrome.tenue,
          )}
        >
          <span>👍 Me gusta</span>
          <span>💬 Comentar</span>
          <span>↪ Compartir</span>
        </div>
      </>
    );
  }
  if (red === 'linkedin') {
    return (
      <>
        <div className={cn('flex items-center justify-between px-3 py-1.5 text-[11px]', chrome.tenue)}>
          <span>👍👏 87</span>
          <span>9 comentarios</span>
        </div>
        <div
          className={cn(
            'flex items-center justify-around border-t border-black/5 py-1.5 text-[12px] font-medium dark:border-white/10',
            chrome.tenue,
          )}
        >
          <span>👍 Recomendar</span>
          <span>💬 Comentar</span>
          <span>↻ Compartir</span>
          <span>➤ Enviar</span>
        </div>
      </>
    );
  }
  return null;
}

// --- pantalla completa (historia, reel, TikTok, Short) ----------------------

/**
 * Historias, reels y TikToks.
 *
 * Aquí lo que importa NO es la imagen: es lo que la red le encima. La barra de
 * progreso arriba, la columna de botones a la derecha, el pie y la música
 * abajo. Ese es el espacio de verdad que le queda al titular, y es justo lo que
 * no se ve en un visor que pinta un rectángulo vacío con la zona segura rayada.
 */
function MarcoPantallaCompleta(p: MarcoProps) {
  const { formato, previa } = p;
  const esTikTok = formato.red === 'tiktok';
  const esHistoria = formato.chrome === 'historia';

  return (
    <div className="relative">
      <Lienzo formato={formato} previa={previa} pieza={p.pieza}>
        {/* barra de progreso de la historia */}
        {esHistoria && (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn('h-0.5 flex-1 rounded-full', i === 0 ? 'bg-white' : 'bg-white/40')}
              />
            ))}
          </div>
        )}

        {/* la firma, encima del video */}
        <div className="pointer-events-none absolute inset-x-2 top-5 flex items-center gap-2">
          {p.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-white" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[10px] font-bold text-black">
              {p.proyecto.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="text-[11px] font-semibold text-white drop-shadow">{p.proyecto}</span>
          {!esHistoria && (
            <span className="rounded border border-white/70 px-1 text-[9px] font-medium text-white">
              Seguir
            </span>
          )}
        </div>

        {/* la columna de botones de la derecha */}
        {!esHistoria && (
          <div className="pointer-events-none absolute bottom-[14%] right-2 flex flex-col items-center gap-3 text-white drop-shadow">
            <Boton icono="♡" n="12.4 K" />
            <Boton icono="💬" n="308" />
            <Boton icono="➤" n="96" />
            {esTikTok && <Boton icono="♫" n="" />}
          </div>
        )}

        {/* el pie, donde de verdad va */}
        <div className="pointer-events-none absolute inset-x-2 bottom-[6%] pr-12">
          <p className="whitespace-pre-wrap text-[11px] leading-snug text-white drop-shadow">
            {previa.visible}
            {previa.cortado && (
              <span className="font-semibold text-white/80">
                {'… '}
                {previa.corte.etiquetaVerMas || 'más'}
              </span>
            )}
          </p>
          {esTikTok && (
            <p className="mt-1 truncate text-[10px] text-white/90 drop-shadow">
              ♫ sonido original · {p.proyecto}
            </p>
          )}
        </div>

        {/* la barra de escribir, que es la que se come la zona de abajo */}
        {esHistoria && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-2">
            <span className="flex-1 rounded-full border border-white/70 px-2 py-1 text-[10px] text-white/90">
              Enviar mensaje
            </span>
            <span className="text-[14px] text-white">♡</span>
            <span className="text-[14px] text-white">➤</span>
          </div>
        )}
      </Lienzo>
    </div>
  );
}

function Boton({ icono, n }: { icono: string; n: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-[17px] leading-none">{icono}</span>
      {n && <span className="text-[9px] font-medium">{n}</span>}
    </span>
  );
}

// --- miniatura de YouTube ---------------------------------------------------

function MarcoMiniatura(p: MarcoProps) {
  const { formato, previa, chrome } = p;
  const lineas = p.texto.split('\n');
  const titulo = lineas[0] || 'Sin título';
  const descripcion = lineas.slice(1).join(' ').trim();

  return (
    <>
      <Lienzo formato={formato} previa={previa} pieza={p.pieza}>
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white">
          8:24
        </span>
      </Lienzo>
      <div className="flex gap-2 px-3 py-2.5">
        {p.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-[12px] font-bold text-[var(--color-primary-foreground)]">
            {p.proyecto.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          {/*
            El título de YouTube se corta a DOS renglones en la lista y a 100
            caracteres en la API. El `line-clamp-2` es el corte de pantalla; el
            contador de la derecha es el de la API. Los dos importan.
          */}
          <p className={cn('line-clamp-2 text-[13px] font-medium leading-tight', chrome.texto)}>
            {titulo.slice(0, 100)}
            {titulo.length > 100 && (
              <span className="text-[var(--color-destructive)] line-through">
                {titulo.slice(100, 140)}
              </span>
            )}
          </p>
          <p className={cn('pt-0.5 text-[11px]', chrome.tenue)}>{p.proyecto}</p>
          <p className={cn('text-[11px]', chrome.tenue)}>3.2 K vistas · hace 2 horas</p>
          {descripcion && (
            <p className={cn('line-clamp-2 pt-1 text-[11px]', chrome.tenue)}>{descripcion}</p>
          )}
        </div>
      </div>
    </>
  );
}

// --- X: el tuit y el hilo ---------------------------------------------------

/**
 * X no tiene "ver más" en el cuerpo: a los 280 RECHAZA. Por eso este marco
 * enseña, cuando el texto se pasa, la segunda burbuja del hilo con lo que
 * sobra — que es lo que de verdad hay que hacer para decirlo todo.
 */
function MarcoHilo(p: MarcoProps) {
  const { formato, previa, chrome } = p;
  const enHilo = previa.seExcede ? previa.sobrante : '';

  return (
    <div className="px-3 py-2.5">
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col items-center">
          {p.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-primary)] text-[12px] font-bold text-[var(--color-primary-foreground)]">
              {p.proyecto.slice(0, 1).toUpperCase()}
            </span>
          )}
          {enHilo && <span className="mt-1 w-px flex-1 bg-[var(--color-border)]" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[13px] leading-tight">
            <span className={cn('font-bold', chrome.texto)}>{p.proyecto}</span>
            <span className={chrome.tenue}>
              @{p.proyecto.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15)} · 12 min
            </span>
          </p>
          <p className={cn('whitespace-pre-wrap pt-0.5 text-[14px] leading-[1.3]', chrome.texto)}>
            {previa.visible}
            {previa.seExcede && (
              <span className="text-[var(--color-destructive)] line-through">
                {previa.sobrante.slice(0, 80)}
                {previa.sobrante.length > 80 ? '…' : ''}
              </span>
            )}
          </p>

          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--color-border)]">
            <Lienzo formato={formato} previa={previa} pieza={p.pieza} />
          </div>

          <div className={cn('flex items-center justify-between pt-2 text-[11px]', chrome.tenue)}>
            <span>💬 24</span>
            <span>↻ 61</span>
            <span>♡ 412</span>
            <span>📊 18 K</span>
            <span>⤴</span>
          </div>
        </div>
      </div>

      {/* la segunda del hilo, con lo que no cabía */}
      {enHilo && (
        <div className="flex gap-2 pt-2">
          <div className="shrink-0">
            {p.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-primary)] text-[12px] font-bold text-[var(--color-primary-foreground)]">
                {p.proyecto.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-[11px] font-medium', chrome.tenue)}>
              2 / lo que no cabe en el primero va aquí
            </p>
            <p className={cn('whitespace-pre-wrap pt-0.5 text-[14px] leading-[1.3]', chrome.texto)}>
              {enHilo.slice(0, 280)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- LinkedIn: el carrusel en PDF -------------------------------------------

function MarcoDocumento(p: MarcoProps) {
  const { formato, previa, chrome } = p;
  return (
    <>
      <Cabecera
        proyecto={p.proyecto}
        logo={p.logo}
        chrome={chrome}
        sub={p.autorLinkedin === 'pagina' ? '1 234 seguidores · Documento' : 'Fundador · 1.er grado'}
        redondo={p.autorLinkedin === 'persona'}
      />
      <Texto previa={previa} chrome={chrome} />
      <div className="relative">
        <Lienzo formato={formato} previa={previa} pieza={p.pieza} />
        <div
          className={cn(
            'flex items-center justify-between border-t border-black/5 px-3 py-1.5 text-[11px] dark:border-white/10',
            chrome.tenue,
          )}
        >
          <span>1 / 8</span>
          <span>Desliza para ver más ›</span>
        </div>
      </div>
      <BarraDeAcciones red="linkedin" chrome={chrome} />
    </>
  );
}

// --- Messenger / DM ---------------------------------------------------------

function MarcoBurbuja(p: MarcoProps) {
  const { formato, previa, chrome } = p;
  const titulo = (p.texto.split('\n')[0] || 'Sin título').slice(0, 80);
  const sub = p.texto.split('\n').slice(1).join(' ').trim().slice(0, 80);

  return (
    <div className="space-y-2 bg-[#f0f2f5] p-3 dark:bg-[#18191a]">
      {/* lo que escribió la persona: es lo que abre la ventana de 24 horas */}
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[#0084ff] px-3 py-1.5 text-[13px] text-white">
          Hola, ¿todavía tienen disponibilidad?
        </p>
      </div>

      <div className="flex items-end gap-1.5">
        {p.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-[var(--color-primary-foreground)]">
            {p.proyecto.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-bl-md border border-black/5 bg-white dark:border-white/10 dark:bg-[#3a3b3c]">
          <Lienzo formato={formato} previa={previa} pieza={p.pieza} />
          <div className="px-2.5 py-1.5">
            <p className={cn('text-[13px] font-semibold leading-tight', chrome.texto)}>{titulo}</p>
            {sub && <p className={cn('text-[12px] leading-tight', chrome.tenue)}>{sub}</p>}
          </div>
          <div className="border-t border-black/5 py-1.5 text-center text-[12px] font-medium text-[#0084ff] dark:border-white/10">
            Agendar visita
          </div>
        </div>
      </div>

      <p className="pt-1 text-center text-[10px] text-[var(--color-muted-foreground)]">
        Dentro de la ventana de 24 horas desde que la persona escribió. Fuera de ahí hace falta una
        etiqueta de mensaje aprobada.
      </p>
    </div>
  );
}
