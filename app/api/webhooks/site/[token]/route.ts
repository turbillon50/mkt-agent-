import { NextRequest, NextResponse } from 'next/server';
import { getProjectById } from '@/lib/projects';
import { projectBySiteToken } from '@/src/projects/connections';
import { ingestLead } from '@/src/sales/ingest';
import { logWebhook } from '@/src/orgs/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * El formulario del sitio del cliente entra por aquí.
 *
 * El token va en la URL porque es lo que el cliente pega en su página: no es la
 * credencial de un tercero, es la puerta que Goossip le generó y que puede
 * rehacer cuando quiera desde Conexiones.
 *
 * Acepta JSON y también `application/x-www-form-urlencoded`, que es lo que
 * manda un `<form>` de toda la vida sin JavaScript de por medio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = await projectBySiteToken(token);
  if (!destino) {
    await logWebhook({ source: 'meta', event: 'sitio', status: 'rejected', detail: 'token desconocido' });
    return NextResponse.json({ error: 'enlace no válido' }, { status: 404 });
  }

  const campos = await leerCampos(req);
  const project = await getProjectById(destino.projectId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const nombre = pick(campos, 'nombre', 'name', 'full_name', 'fullname', 'nombre_completo');
  const telefono = pick(campos, 'telefono', 'teléfono', 'phone', 'celular', 'whatsapp', 'tel');
  const correo = pick(campos, 'correo', 'email', 'mail', 'e-mail');

  if (!telefono && !correo) {
    return NextResponse.json(
      { error: 'el formulario tiene que mandar al menos teléfono o correo' },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  try {
    const r = await ingestLead({
      project,
      fullName: nombre,
      phone: telefono,
      email: correo,
      source: 'site',
      // Sin id externo, dos envíos idénticos serían dos leads. El teléfono ya
      // deduplica en `upsertLead`; esto solo lo hace rastreable.
      sourceRef: `sitio:${telefono ?? correo}`,
      createdAt: new Date(),
      raw: campos,
    });
    await logWebhook({ source: 'meta', event: 'sitio', status: 'ok', orgId: project.orgId });
    return NextResponse.json({
      ok: true,
      creado: r.created,
      grado: r.lead.grade,
      ms: Date.now() - t0,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'error';
    await logWebhook({ source: 'meta', event: 'sitio', status: 'error', detail, orgId: project.orgId });
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

async function leerCampos(req: NextRequest): Promise<Record<string, string>> {
  const tipo = req.headers.get('content-type') ?? '';
  if (tipo.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    return Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

/** Los formularios del mundo real no se ponen de acuerdo en cómo llamar al teléfono. */
function pick(campos: Record<string, string>, ...nombres: string[]): string | null {
  const normalizado = new Map(
    Object.entries(campos).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()]),
  );
  for (const n of nombres) {
    const v = normalizado.get(n);
    if (v) return v;
  }
  return null;
}
