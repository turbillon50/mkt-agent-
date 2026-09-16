import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Los adjuntos del Asistente.
 *
 * Tres acciones en una ruta, y la razón de que no sean tres rutas es que las
 * tres son "subir un archivo a este proyecto" por caminos distintos según el
 * almacén que haya:
 *
 *   · `GET` — qué almacén hay y cuánto aguanta. El compose lo pregunta al
 *     montarse para no dejar que alguien arrastre 80 MB a un almacén de 3.
 *
 *   · `POST` con un cuerpo de Blob (`type: 'blob.*'`) — la firma de la subida
 *     DIRECTA del navegador a Vercel Blob. El archivo nunca pasa por aquí, que
 *     es el punto: en Vercel el cuerpo de una petición a una función tiene
 *     tope de 4.5 MB y un video de 200 MB no puede entrar por una ruta de Next
 *     aunque el almacén de destino lo aguante.
 *
 *   · `POST` con `{ archivo }` — el camino del almacén de la casa: el archivo
 *     llega en base64 y se escribe por el relay. Es el que hay cuando no existe
 *     `BLOB_READ_WRITE_TOKEN`, y por eso mismo trae el tope de 3 MB pegado.
 *
 *   · `POST` con `{ registrar }` — después de una subida directa a Blob, el
 *     navegador avisa y aquí se crea la fila de `assistant_files`. Vercel Blob
 *     ofrece `onUploadCompleted` para esto, pero ese callback NO se dispara en
 *     localhost (necesita una URL pública), así que el registro quedaría
 *     funcionando en producción y roto en desarrollo. Avisar desde el cliente
 *     funciona en los dos lados.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { capacidadDeAlmacen } = await import('@/src/assistant/almacen');
  return NextResponse.json(capacidadDeAlmacen());
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Subir un archivo al proyecto es escribir en él: un lector no sube nada.
  const gate = await apiProject(id, { capability: 'operar' });
  if (!gate.ok) return gate.res;

  const cuerpo = await req.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { almacenDeAdjuntos } = await import('@/src/assistant/almacen');
  const { registrarArchivo } = await import('@/src/assistant/hilos');
  const { revisarArchivo } = await import('@/src/assistant/tipos-archivo');
  const ambito = { orgId: gate.ctx.orgId, projectId: id, userId: gate.ctx.user.id };

  /* ---- 1. La firma de la subida directa a Blob ---- */
  if (typeof (cuerpo as { type?: unknown }).type === 'string' && String((cuerpo as { type: string }).type).startsWith('blob.')) {
    if (almacenDeAdjuntos() !== 'blob') {
      return NextResponse.json(
        { error: 'No hay Blob configurado en este entorno.' },
        { status: 409 },
      );
    }
    try {
      const { handleUpload } = await import('@vercel/blob/client');
      const respuesta = await handleUpload({
        body: cuerpo as never,
        request: req,
        onBeforeGenerateToken: async (pathname: string) => ({
          // El tope va aquí y no en el navegador. Lo que valida el cliente es
          // para no hacerle perder el tiempo a la gente; lo que impide subir un
          // archivo de 2 GB es esto, que corre en el servidor.
          maximumSizeInBytes: 200 * 1024 * 1024,
          // El archivo queda bajo el proyecto. No es seguridad —una URL de Blob
          // es pública para quien la tenga— es poder barrer lo de un cliente
          // el día que se dé de baja.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId: id, pathname }),
        }),
        // Existe porque la firma lo pide. El registro de verdad lo hace la
        // acción `registrar`, por lo del localhost.
        onUploadCompleted: async () => undefined,
      });
      return NextResponse.json(respuesta);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se pudo firmar la subida.' },
        { status: 500 },
      );
    }
  }

  /* ---- 2. Registrar lo que ya subió el navegador a Blob ---- */
  const registrar = (cuerpo as { registrar?: Record<string, unknown> }).registrar;
  if (registrar) {
    const nombre = String(registrar.nombre ?? '').trim();
    const url = String(registrar.url ?? '').trim();
    const mime = String(registrar.mime ?? '').trim();
    const size = Number(registrar.size ?? 0);

    if (!nombre || !url.startsWith('https://')) {
      return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 });
    }
    const veredicto = revisarArchivo(nombre, mime, size);
    if (!veredicto.ok) {
      return NextResponse.json({ error: veredicto.motivo }, { status: 400 });
    }

    const fila = await registrarArchivo({
      ambito,
      conversationId: hiloDe(registrar.conversationId),
      name: nombre,
      url,
      mime,
      size,
      storage: 'blob',
    });
    return NextResponse.json({ archivo: aJson(fila) });
  }

  /* ---- 3. El almacén de la casa ---- */
  const archivo = (cuerpo as { archivo?: Record<string, unknown> }).archivo;
  if (!archivo) {
    return NextResponse.json({ error: 'No mandaste ningún archivo.' }, { status: 400 });
  }

  const nombre = String(archivo.nombre ?? '').trim();
  const mime = String(archivo.mime ?? '').trim();
  const datos = String(archivo.datos ?? '');
  if (!nombre || !datos) {
    return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 });
  }

  const bytes = Buffer.from(datos, 'base64');
  const veredicto = revisarArchivo(nombre, mime, bytes.byteLength);
  if (!veredicto.ok) {
    return NextResponse.json({ error: veredicto.motivo }, { status: 400 });
  }

  try {
    const { subirPorLaCasa } = await import('@/src/assistant/almacen');
    const url = await subirPorLaCasa(bytes, nombre);
    const fila = await registrarArchivo({
      ambito,
      conversationId: hiloDe(archivo.conversationId),
      name: nombre,
      url,
      mime: mime || 'application/octet-stream',
      size: bytes.byteLength,
      storage: 'casa',
    });
    return NextResponse.json({ archivo: aJson(fila) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar el archivo.' },
      { status: 500 },
    );
  }
}

function hiloDe(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

function aJson(f: {
  id: string;
  name: string;
  url: string;
  mime: string;
  size: number;
  storage: string;
}) {
  return { id: f.id, nombre: f.name, url: f.url, mime: f.mime, size: f.size, almacen: f.storage };
}
