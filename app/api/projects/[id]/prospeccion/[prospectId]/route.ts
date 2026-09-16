import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

const ESTADOS = ['nuevo', 'contactado', 'descartado', 'convertido'] as const;

/**
 * Lo que se hace con UN prospecto:
 *
 *   · `convertir` — pasa a `sales_leads` con `source='maps'`.
 *   · `proponer`  — lo convierte y deja el primer mensaje REDACTADO en la cola,
 *     esperando visto bueno. La palabra es *proponer*: no sale nada solo.
 *   · `mover`     — contactado / descartado, a mano.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; prospectId: string }> },
) {
  const { id, prospectId } = await ctx.params;
  const gate = await apiProject(id, { section: 'leads', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;
  const { convertirALead, moverProspecto, proponerContacto } = await import(
    '@/src/prospeccion/maps'
  );
  const { logProjectEvent } = await import('@/src/projects/events');

  try {
    if (body?.accion === 'convertir') {
      const r = await convertirALead({ project: gate.ctx.project, prospectId, quien });
      if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
      await logProjectEvent({
        orgId: gate.ctx.orgId,
        projectId: id,
        type: 'prospecto_convertido',
        actor: gate.ctx.clerkUserId,
        actorEmail: gate.ctx.user.email,
        payload: { prospecto: r.prospecto.name, leadId: r.leadId, nuevo: r.creado },
      });
      return NextResponse.json({ ok: true, leadId: r.leadId, nuevo: r.creado, estado: 'convertido' });
    }

    if (body?.accion === 'proponer') {
      const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
      if (mensaje.length < 10) {
        return NextResponse.json(
          { error: 'Escribe el mensaje que quieres dejar en la cola.' },
          { status: 400 },
        );
      }
      const canal = ['correo', 'messenger', 'llamada'].includes(body?.canal)
        ? body.canal
        : 'correo';
      const r = await proponerContacto({
        project: gate.ctx.project,
        prospectId,
        mensaje,
        canal,
        quien,
      });
      return NextResponse.json(r, { status: r.ok ? 200 : 409 });
    }

    if (ESTADOS.includes(body?.estado)) {
      const fila = await moverProspecto(gate.ctx.orgId, id, prospectId, body.estado);
      if (!fila) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json({ ok: true, estado: fila.status });
    }

    return NextResponse.json({ error: 'No entendí qué hacer con el prospecto.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo.' },
      { status: 400 },
    );
  }
}
