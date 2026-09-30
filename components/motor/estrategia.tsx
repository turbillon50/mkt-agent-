/**
 * La pantalla Estrategia.
 *
 * Es el documento que se le puede enseñar TAL CUAL al comprador (principio 1:
 * transparencia, no gancho). De ahí salen las tres decisiones de diseño:
 *
 *   1. **Cada cifra trae su cola pegada**: fuente, fecha, muestra y método, a la
 *      vista y no escondidos en un tooltip. Si hay que pasar el mouse para saber
 *      de dónde salió un número, no es transparencia.
 *   2. **Los huecos se enseñan igual que los datos.** Un "sin dato, y así se
 *      mediría" ocupa su renglón completo. Una pantalla que solo muestra lo que
 *      sí sabe miente por omisión.
 *   3. **Cero jerga de desarrollo.** No hay "uuid", ni "jsonb", ni "endpoint", ni
 *      nombres de tabla. Lo que el motor deduce dice "lo deduzco yo, confírmalo".
 *
 * Los números NO se escriben aquí: vienen ya armados de `src/motor/pantalla.ts`
 * como afirmaciones con procedencia, y la prueba los audita sin renderizar React.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EstrategiaEnPantalla } from '@/src/motor/pantalla';

const CALIDAD_COLOR: Record<string, string> = {
  alta: 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
  media: 'border-amber-600/30 bg-amber-50 text-amber-800',
  baja: 'border-rose-600/30 bg-rose-50 text-rose-800',
};

const CALIDAD_LEYENDA: Record<string, string> = {
  alta: 'Dato firme',
  media: 'Dato aceptable',
  baja: 'Dato flojo: tómalo con reservas',
};

export function PantallaEstrategia({ e }: { e: EstrategiaEnPantalla }) {
  return (
    <div className="space-y-5">
      <Ficha e={e} />
      <Radar e={e} />
      <Publicos e={e} />
      <Plan e={e} />
    </div>
  );
}

/* ------------------------------------------------------------------ la ficha */

function Ficha({ e }: { e: EstrategiaEnPantalla }) {
  const f = e.ficha;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>El negocio</CardTitle>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{f.estadoLeyenda}</p>
        </div>
        <Badge variant={f.estado === 'confirmada' ? 'default' : 'secondary'}>
          {f.estado === 'confirmada' ? 'Confirmada por el dueño' : f.estado === 'borrador' ? 'Borrador' : 'Sin armar'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {!f.existe ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay ficha de este negocio. Sin ella, el motor no puede proponer nada sin inventárselo.
          </p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Campo titulo="Qué vende" valor={f.queVende} />
              <Campo titulo="Giro" valor={f.giro} />
              <Campo
                titulo="Precio"
                valor={f.precio}
                // El precio desconocido no se disfraza de "a consultar": se dice.
                aviso={f.precioDesconocido ? 'Nadie lo ha dicho y no se lee en su sitio. No se inventa uno.' : null}
              />
              <Campo titulo="Dónde vende" valor={f.mercados} />
            </dl>

            {f.propuesta && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  Su propuesta
                </p>
                <p className="mt-1 text-sm">{f.propuesta}</p>
              </div>
            )}

            {f.resumen && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  El resumen que leen todas las etapas
                </p>
                <p className="mt-1 text-sm leading-relaxed">{f.resumen}</p>
              </div>
            )}

            <p className="text-xs text-[var(--color-muted-foreground)]">{f.solidez}</p>

            {f.deducidos.length > 0 && (
              <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">Esto lo deduje yo, no me lo dijo nadie</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {f.deducidos.join(' · ')}. Trátalo como suposición hasta que el dueño lo confirme.
                </p>
              </div>
            )}

            {f.preguntas.length > 0 && (
              <div>
                <p className="text-sm font-medium">Lo que necesito preguntarte</p>
                <ul className="mt-2 space-y-2">
                  {f.preguntas.map((q, i) => (
                    <li key={i} className="rounded-lg border border-[var(--color-border)] p-3">
                      <p className="text-sm font-medium">{q.pregunta}</p>
                      {/* El PORQUÉ de la pregunta, no solo la pregunta: así no se
                          siente un formulario, se siente que hay una razón. */}
                      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{q.porque}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {e.lecturas.length > 0 && (
              <details className="rounded-lg border border-[var(--color-border)] p-3">
                <summary className="cursor-pointer text-sm font-medium">Qué alcancé a leer del negocio</summary>
                <ul className="mt-2 space-y-1">
                  {e.lecturas.map((l, i) => (
                    <li key={i} className="text-xs text-[var(--color-muted-foreground)]">
                      <span className="font-medium">{l.que}:</span> {l.detalle}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({ titulo, valor, aviso }: { titulo: string; valor: string | null; aviso?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">{titulo}</dt>
      <dd className="mt-1 text-sm">{valor ?? 'Sin dato'}</dd>
      {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ el radar */

function Radar({ e }: { e: EstrategiaEnPantalla }) {
  const r = e.radar;
  return (
    <Card>
      <CardHeader>
        <CardTitle>El mercado, medido</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Cada número dice de dónde salió, cuándo se midió, de cuántos casos y cómo. Los que no se
          pudieron medir también aparecen.
        </p>
        {r.corrida && (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            El radar {r.corrida.cuando} y {r.corrida.estado}.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!r.hayAlgo && <p className="text-sm text-[var(--color-muted-foreground)]">{r.vacioLeyenda}</p>}

        {r.filas.map((s, i) => (
          <div key={i} className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{s.etiqueta}</p>
              <div className="flex items-center gap-2">
                <p className={s.hueco ? 'text-sm text-[var(--color-muted-foreground)]' : 'text-lg font-semibold'}>
                  {s.valor}
                </p>
                {!s.hueco && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${CALIDAD_COLOR[s.calidad] ?? ''}`}>
                    {CALIDAD_LEYENDA[s.calidad] ?? s.calidad}
                  </span>
                )}
              </div>
            </div>

            {s.hueco ? (
              // Un hueco no es un renglón vacío: dice qué falta y cómo se mediría.
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                No hay dato. <span className="font-medium">Así se mediría:</span> {s.comoMedirlo}
              </p>
            ) : (
              <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                <p>
                  <span className="font-medium">De dónde:</span>{' '}
                  {s.fuenteUrl ? (
                    <a href={s.fuenteUrl} target="_blank" rel="noreferrer" className="underline">
                      {s.fuenteNombre}
                    </a>
                  ) : (
                    s.fuenteNombre
                  )}
                </p>
                <p>
                  <span className="font-medium">Cuándo:</span> {s.cuando} · {s.muestra}
                </p>
                <p>
                  <span className="font-medium">Cómo:</span> {s.metodo}
                </p>
                {s.calidadMotivo && <p className="italic">{s.calidadMotivo}</p>}
              </div>
            )}
          </div>
        ))}

        {r.corrida && r.corrida.negadas.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
            <p className="text-sm font-medium">Lo que no me dejaron leer</p>
            <ul className="mt-1 space-y-1">
              {r.corrida.negadas.map((n, i) => (
                <li key={i} className="text-xs text-[var(--color-muted-foreground)]">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- los públicos */

function Publicos({ e }: { e: EstrategiaEnPantalla }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>A quién le hablamos</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Cada público con lo que le duele, lo que se le ofrece y por qué creemos que es él.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {e.publicos.filas.length === 0 && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay públicos. Hacen falta la ficha del negocio y, ojalá, el radar del mercado.
          </p>
        )}

        {e.publicos.filas.map((p) => (
          <div key={p.id} className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{p.nombre}</p>
              <Badge variant="secondary">{p.etapaLabel}</Badge>
            </div>
            <dl className="mt-2 space-y-1 text-sm">
              <Renglon k="Quién es" v={p.segmento} />
              <Renglon k="Qué le duele" v={p.dolor} />
              <Renglon k="Qué le ofrecemos" v={p.oferta} />
              <Renglon k="Por qué él" v={p.porque} />
            </dl>
            {p.sinApoyo ? (
              // Sin medición detrás se dice, y se dice fuerte: es la diferencia
              // entre una estrategia sostenida y una corazonada bien escrita.
              <p className="mt-2 text-xs text-amber-700">
                No hay ninguna medición que lo sostenga: es una propuesta del analista, no un hallazgo.
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">
                Lo sostienen {p.apoyos} {p.apoyos === 1 ? 'medición' : 'mediciones'} de las de arriba.
              </p>
            )}
          </div>
        ))}

        {e.publicos.etapasSinCubrir.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
            <p className="text-sm font-medium">Momentos del comprador que nadie está atendiendo</p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {e.publicos.etapasSinCubrir.join(' · ')}. No siempre es un error —a veces se decide no ir
              por ahí— pero conviene que sea una decisión y no un olvido.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Renglon({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------- el plan */

function Plan({ e }: { e: EstrategiaEnPantalla }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué se publica, dónde y para qué</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Cada publicación nace con su hipótesis y con la métrica que la va a juzgar. Sin eso no se
          aprende nada: solo se acumula historial.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {e.plan.filas.length === 0 && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay plan. Primero hacen falta los públicos.
          </p>
        )}

        {e.plan.filas.map((f) => (
          <div key={f.id} className="rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {f.redLabel} <span className="text-[var(--color-muted-foreground)]">para</span>{' '}
                {f.publico ?? 'sin público asignado'}
              </p>
              {f.frecuencia && <Badge variant="secondary">{f.frecuencia}</Badge>}
            </div>

            <dl className="mt-2 space-y-1 text-sm">
              <Renglon k="Para qué" v={f.objetivo} />
              <Renglon k="Se mide con" v={f.metrica} />
              <Renglon k="Por qué ahí" v={f.porque} />
            </dl>

            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              <span className="font-medium">Por qué esa métrica:</span> {f.metricaPorque}
            </p>

            <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                La apuesta
              </p>
              <p className="mt-1 text-sm">{f.hipotesis}</p>
            </div>

            {/* Las reglas de red aplicadas, con su versión. No es adorno: es lo que
                deja discutir una decisión sin creerle a nadie de memoria. */}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
                Reglas de la red que se aplicaron
              </summary>
              <ul className="mt-1 space-y-0.5">
                {f.reglas.map((r, i) => (
                  <li key={i} className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    {r}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
