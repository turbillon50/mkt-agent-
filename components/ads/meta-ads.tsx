'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Los anuncios de Meta del proyecto: gasto de 7 y 30 días, costo por lead y las
 * campañas que están corriendo.
 *
 * Es de SOLO LECTURA a propósito y se dice en pantalla. Meta Ads vive en la
 * cuenta del cliente: Goossip la lee para poder contestar "¿cómo vamos?", y
 * prender, apagar o repartir el presupuesto se sigue haciendo allá. Un botón
 * de "pausar" aquí haría creer que Goossip administra la pauta, y no es así.
 *
 * Igual que la sección de Google: separada y abajo, para que nadie piense que
 * las campañas de arriba (las de Goossip) son las mismas.
 */

interface Campaña {
  id: string;
  nombre: string;
  estado: string;
  activa: boolean;
  objetivo: string | null;
  presupuestoDiario: number | null;
}

interface Resumen {
  conectado: boolean;
  motivo?: string;
  cuenta: { id: string; nombre: string; business: string | null; moneda: string | null } | null;
  gasto7d: number;
  gasto30d: number;
  cpl: { dias: number; gasto: number; leads: number; leadsSegunMeta: number; cpl: number | null } | null;
  campañas: Campaña[];
  campañasActivas: number;
}

function dinero(n: number, moneda: string | null): string {
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}${moneda ? ` ${moneda}` : ''}`;
}

export function MetaAds({ projectId }: { projectId: string }) {
  const [resumen, setResumen] = React.useState<Resumen | null>(null);
  const [cargando, setCargando] = React.useState(true);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/metaads`, { cache: 'no-store' });
      const data = await res.json();
      setResumen(res.ok ? data : { ...vacio, motivo: data.error ?? vacio.motivo });
    } catch {
      // La ruta ya devuelve el motivo en español; esto es solo la red de aquí.
      setResumen({ ...vacio, motivo: 'No pudimos cargar tus anuncios de Meta ahora mismo.' });
    } finally {
      setCargando(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <Card className="card-glow">
        <CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Cargando tus anuncios de Meta…
        </CardContent>
      </Card>
    );
  }

  if (!resumen?.conectado) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {resumen?.motivo ?? 'Meta Ads no está conectado en este proyecto.'}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/conexiones`}>Conectar Meta Ads</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const moneda = resumen.cuenta?.moneda ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Cuenta: <span className="text-[var(--color-foreground)]">{resumen.cuenta?.nombre}</span>
          {resumen.cuenta?.business && ` · ${resumen.cuenta.business}`}
        </p>
        <Button onClick={() => void cargar()} variant="outline" size="sm">
          Refrescar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Numero titulo="Gasto de 7 días" valor={dinero(resumen.gasto7d, moneda)} />
        <Numero titulo="Gasto de 30 días" valor={dinero(resumen.gasto30d, moneda)} />
        <Numero
          titulo="Costo por lead (30 días)"
          valor={resumen.cpl?.cpl !== null && resumen.cpl?.cpl !== undefined
            ? dinero(resumen.cpl.cpl, moneda)
            : '—'}
          pie={
            resumen.cpl
              ? `${resumen.cpl.leads} leads entraron a Goossip · Meta reporta ${resumen.cpl.leadsSegunMeta}`
              : undefined
          }
        />
      </div>

      {resumen.campañas.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Esta cuenta todavía no tiene campañas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {resumen.campañas.map((c) => (
            <Card key={c.id} className="card-glow">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.nombre}</span>
                    <Badge variant={c.activa ? 'default' : 'outline'}>{c.estado}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {c.objetivo ? c.objetivo.replaceAll('_', ' ').toLowerCase() : 'sin objetivo'}
                    {c.presupuestoDiario !== null &&
                      ` · ${dinero(c.presupuestoDiario, moneda)} al día`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        Goossip solo lee esta cuenta. Para crear campañas o mover el presupuesto, entra a tu
        Administrador de anuncios de Meta.
      </p>
    </div>
  );
}

const vacio: Resumen = {
  conectado: false,
  motivo: 'Meta Ads no está conectado en este proyecto.',
  cuenta: null,
  gasto7d: 0,
  gasto30d: 0,
  cpl: null,
  campañas: [],
  campañasActivas: 0,
};

function Numero({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <Card className="card-glow">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-[var(--color-muted-foreground)]">{titulo}</p>
        <p className="text-xl font-semibold">{valor}</p>
        {pie && <p className="text-[11px] text-[var(--color-muted-foreground)]">{pie}</p>}
      </CardContent>
    </Card>
  );
}
