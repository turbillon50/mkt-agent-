import { NextRequest, NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Goossip como empleado, en TODOS los proyectos.
 *
 * Es la vista de dueño: qué tanto está trabajando Goossip en cada cliente y a
 * costa de cuántas correcciones. El mismo cálculo que ve cada cliente en sus
 * Ajustes — si el número del admin y el del cliente no fueran el mismo, uno de
 * los dos estaría mintiendo.
 */
export async function GET(req: NextRequest) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;

  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get('dias')) || 30, 1), 365);

  const { db } = await import('@/src/db/client');
  const { campaigns } = await import('@/src/db/schema');
  const { metricasDeLaOrg } = await import('@/src/autonomia/metricas');
  const { nivelDe, NIVEL } = await import('@/src/autonomia/niveles');

  // 60 proyectos es el techo de una pantalla, y cada uno son varias consultas.
  const proyectos = await db.select().from(campaigns).limit(60);
  const filas = await metricasDeLaOrg(proyectos, dias);

  const total = filas.reduce(
    (acc, f) => ({
      publicadas: acc.publicadas + f.metricas.piezasPublicadas,
      contactados: acc.contactados + f.metricas.leadsContactados,
      correcciones: acc.correcciones + f.metricas.correcciones,
      horas: Number((acc.horas + f.metricas.ahorro.horas).toFixed(1)),
    }),
    { publicadas: 0, contactados: 0, correcciones: 0, horas: 0 },
  );

  return NextResponse.json({
    dias,
    total,
    proyectos: filas.map((f) => {
      const p = proyectos.find((x) => x.id === f.project)!;
      const n = nivelDe(p);
      return {
        id: f.project,
        nombre: f.nombre,
        nivel: n,
        nivelNombre: NIVEL[n].nombre,
        ...f.metricas,
      };
    }),
  });
}
