'use client';

import { useCallback, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IconCheck, IconPalette, IconPlus, IconTrash } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

/**
 * El kit de marca, en pantalla.
 *
 * El alta es guiada y en ese orden porque es el orden en que la gente tiene las
 * cosas: casi nadie tiene su manual de marca a la mano, pero TODO EL MUNDO
 * tiene su logo. Se sube el logo, el sistema lo mira y propone, y el usuario
 * corrige lo que no le cuadre. Pedirle seis hex de entrada es pedirle que abra
 * Illustrator antes de poder usar Goossip.
 *
 * Lo que la propuesta NO hace es guardarse sola: mientras el usuario no
 * apriete "Guardar el kit", la marca del proyecto no ha cambiado. Una marca que
 * se cambia sola porque un modelo opinó es exactamente lo que un cliente no
 * perdona.
 */

type Color = { rol: string; hex: string; nombre?: string };
type Fuente = { rol: string; familia: string; peso?: string };

export interface KitInicial {
  logoUrl: string | null;
  paleta: Color[];
  tipografias: Fuente[];
  tono: string | null;
  palabrasProhibidas: string[];
  aprobadoPor: string | null;
  aprobadoEn: string | null;
}

const ROLES_COLOR = ['primario', 'secundario', 'fondo', 'texto', 'acento'];
const ROLES_FUENTE = ['titulos', 'texto'];

const ROL_AYUDA: Record<string, string> = {
  primario: 'El que manda: botones y acentos fuertes.',
  secundario: 'El de apoyo.',
  fondo: 'El fondo de las piezas.',
  texto: 'El de las letras.',
  acento: 'El del detalle.',
};

export function BrandKitBoard({
  projectId,
  inicial,
  puedeEditar,
}: {
  projectId: string;
  inicial: KitInicial | null;
  puedeEditar: boolean;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(inicial?.logoUrl ?? null);
  const [paleta, setPaleta] = useState<Color[]>(inicial?.paleta ?? []);
  const [fuentes, setFuentes] = useState<Fuente[]>(inicial?.tipografias ?? []);
  const [tono, setTono] = useState(inicial?.tono ?? '');
  const [prohibidas, setProhibidas] = useState((inicial?.palabrasProhibidas ?? []).join(', '));
  const [lectura, setLectura] = useState<string | null>(null);
  const [mirando, setMirando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const subirLogo = useCallback(
    async (file: File) => {
      setMirando(true);
      setLectura(null);
      try {
        const dataUrl: string = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error('No se pudo leer el archivo.'));
          fr.readAsDataURL(file);
        });

        const r = await fetch(`/api/projects/${projectId}/marca/proponer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoDataUrl: dataUrl }),
        });
        const d = await r.json();

        if (d.logoUrl) setLogoUrl(d.logoUrl);
        if (d.propuesta) {
          if (d.propuesta.paleta?.length) setPaleta(d.propuesta.paleta);
          if (d.propuesta.tipografias?.length) setFuentes(d.propuesta.tipografias);
          if (d.propuesta.tono) setTono(d.propuesta.tono);
          if (d.propuesta.palabrasProhibidas?.length) {
            setProhibidas(d.propuesta.palabrasProhibidas.join(', '));
          }
          setLectura(d.propuesta.lectura || null);
          toast.push({ title: 'Miré tu logo', description: 'Te propuse paleta y tono. Corrige lo que no te cuadre.', variant: 'success' });
        } else if (d.error) {
          toast.push({ title: 'No pude leer el logo', description: d.error, variant: 'error' });
        }
      } catch (e) {
        toast.push({ title: 'No se pudo subir el logo', description: e instanceof Error ? e.message : undefined, variant: 'error' });
      } finally {
        setMirando(false);
      }
    },
    [projectId, toast],
  );

  const guardar = useCallback(async () => {
    setGuardando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/marca`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoUrl,
          paleta,
          tipografias: fuentes,
          tono,
          palabrasProhibidas: prohibidas,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? 'No se pudo guardar.');
      toast.push({ title: 'Kit guardado', description: 'Todo lo que Goossip haga para este proyecto lo va a usar.', variant: 'success' });
    } catch (e) {
      toast.push({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : undefined, variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }, [projectId, logoUrl, paleta, fuentes, tono, prohibidas, toast]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* ---- 1. el logo ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1 · Tu logo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-accent)]/40"
                aria-label="Logo del proyecto"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
                ) : (
                  <IconPalette className="h-7 w-7 text-[var(--color-muted-foreground)]" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Sube tu logo y lo miro para proponerte la paleta y el tono. Después corriges lo
                  que quieras.
                </p>
                {puedeEditar && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void subirLogo(f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mirando}
                      onClick={() => fileRef.current?.click()}
                    >
                      {mirando ? 'Mirando tu logo…' : logoUrl ? 'Cambiar el logo' : 'Subir el logo'}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {lectura && (
              <p className="rounded-lg bg-[var(--color-accent)]/50 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                Lo que vi: {lectura}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ---- 2. la paleta ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2 · Tus colores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paleta.length === 0 && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Todavía no hay colores. Sube tu logo o agrégalos a mano.
              </p>
            )}
            <div className="space-y-2">
              {paleta.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label={`Color ${c.rol}`}
                    value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#000000'}
                    disabled={!puedeEditar}
                    onChange={(e) =>
                      setPaleta((p) =>
                        p.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)),
                      )
                    }
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0.5"
                  />
                  <select
                    aria-label="Para qué sirve este color"
                    value={c.rol}
                    disabled={!puedeEditar}
                    onChange={(e) =>
                      setPaleta((p) => p.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))
                    }
                    className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm"
                  >
                    {ROLES_COLOR.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={c.hex}
                    disabled={!puedeEditar}
                    aria-label="Código del color"
                    onChange={(e) =>
                      setPaleta((p) =>
                        p.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)),
                      )
                    }
                    className="h-9 w-28 font-mono text-xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">
                    {c.nombre ?? ROL_AYUDA[c.rol] ?? ''}
                  </span>
                  {puedeEditar && (
                    <button
                      type="button"
                      aria-label="Quitar este color"
                      onClick={() => setPaleta((p) => p.filter((_, j) => j !== i))}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)]"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {puedeEditar && paleta.length < 12 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPaleta((p) => [...p, { rol: 'acento', hex: '#0B5FFF' }])}
              >
                <IconPlus className="h-3.5 w-3.5" />
                Agregar un color
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ---- 3. tipografías y voz ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3 · Cómo se ve y cómo habla</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {fuentes.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Para qué sirve esta tipografía"
                    value={f.rol}
                    disabled={!puedeEditar}
                    onChange={(e) =>
                      setFuentes((p) => p.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))
                    }
                    className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm"
                  >
                    {ROLES_FUENTE.map((r) => (
                      <option key={r} value={r}>
                        {r === 'titulos' ? 'títulos' : 'texto'}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={f.familia}
                    disabled={!puedeEditar}
                    aria-label="Nombre de la tipografía"
                    onChange={(e) =>
                      setFuentes((p) =>
                        p.map((x, j) => (j === i ? { ...x, familia: e.target.value } : x)),
                      )
                    }
                    className="h-9 min-w-0 flex-1"
                    placeholder="Inter, Poppins, Playfair…"
                  />
                  {puedeEditar && (
                    <button
                      type="button"
                      aria-label="Quitar esta tipografía"
                      onClick={() => setFuentes((p) => p.filter((_, j) => j !== i))}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)]"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {puedeEditar && fuentes.length < 6 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFuentes((p) => [...p, { rol: 'texto', familia: '' }])}
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Agregar una tipografía
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tono" className="text-xs font-medium">
                Tono de voz
              </label>
              <Textarea
                id="tono"
                value={tono}
                disabled={!puedeEditar}
                onChange={(e) => setTono(e.target.value)}
                placeholder="Cercano pero profesional. Tuteamos. Nada de exclamaciones ni mayúsculas gritadas."
                className="min-h-[90px]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prohibidas" className="text-xs font-medium">
                Palabras que no quieres leer
              </label>
              <Input
                id="prohibidas"
                value={prohibidas}
                disabled={!puedeEditar}
                onChange={(e) => setProhibidas(e.target.value)}
                placeholder="barato, oferta, urgente"
              />
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                Separadas por comas. Si alguna se cuela en una pieza, te aviso antes de hacerla.
              </p>
            </div>
          </CardContent>
        </Card>

        {puedeEditar && (
          <div className="flex items-center justify-end gap-3">
            <Button onClick={guardar} disabled={guardando} className="btn-brand">
              {guardando ? 'Guardando…' : 'Guardar el kit'}
            </Button>
          </div>
        )}
      </div>

      {/* ---- la vista previa ---- */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cómo se va a ver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Previa logoUrl={logoUrl} paleta={paleta} fuentes={fuentes} />
            {inicial?.aprobadoEn && (
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                Guardado por {inicial.aprobadoPor ?? 'alguien del equipo'} el{' '}
                {new Date(inicial.aprobadoEn).toLocaleDateString('es-MX')}.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {paleta.map((c, i) => (
                <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                  {c.rol} {c.hex}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Una pieza de mentira con los colores de verdad.
 *
 * Es lo que convierte seis códigos hex en una decisión: nadie sabe si
 * `#0B1220` con `#F4B740` encima se lee hasta que lo ve puesto uno sobre otro.
 */
function Previa({
  logoUrl,
  paleta,
  fuentes,
}: {
  logoUrl: string | null;
  paleta: Color[];
  fuentes: Fuente[];
}) {
  const de = (rol: string, fallback: string) =>
    paleta.find((c) => c.rol === rol && /^#[0-9a-fA-F]{6}$/.test(c.hex))?.hex ?? fallback;

  const fondo = de('fondo', '#12151C');
  const texto = de('texto', '#FFFFFF');
  const primario = de('primario', '#0B5FFF');
  const familia = fuentes.find((f) => f.rol === 'titulos')?.familia ?? fuentes[0]?.familia ?? '';

  return (
    <div
      className="flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl p-5"
      style={{ backgroundColor: fondo, color: texto, fontFamily: familia || undefined }}
    >
      <div className="h-8">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-auto max-w-[60%] object-contain" />
        )}
      </div>
      <div className="space-y-3">
        <p className="text-xl font-bold leading-tight">Así se va a ver tu próxima pieza.</p>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: primario, color: contraste(primario) }}
        >
          <IconCheck className="h-3 w-3" />
          Quiero saber más
        </span>
      </div>
    </div>
  );
}

/**
 * Blanco o negro encima de un color, por luminancia.
 *
 * No es un detalle: el CTA es el único elemento de la pieza que EXISTE para que
 * alguien lo lea. Un amarillo de marca con texto blanco encima es un botón
 * invisible, y "se veía bien en mi monitor" no es una medición.
 */
function contraste(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0B0B0F' : '#FFFFFF';
}
