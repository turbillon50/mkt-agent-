'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pesoLegible, revisarArchivo } from '@/src/assistant/tipos-archivo';
import type { AdjuntoUI } from './use-asistente';

/**
 * Los archivos del compose: soltarlos, pegarlos o elegirlos, y que lleguen al
 * almacén del proyecto.
 *
 * Dos caminos, y el que se toma lo dice el SERVIDOR al montar el compose:
 *
 *   · **Blob** — el navegador sube DIRECTO a Vercel Blob; esta app solo firma
 *     el permiso. Es lo único que puede con un video de 200 MB, porque el
 *     archivo nunca pasa por una función (tope de 4.5 MB de cuerpo).
 *   · **La casa** — el archivo va en base64 dentro de un POST normal. Es lo que
 *     hay sin `BLOB_READ_WRITE_TOKEN`, y por eso el tope baja a 3 MB.
 *
 * Preguntar primero y no "intentar y ver" es a propósito: rechazar un archivo
 * de 80 MB DESPUÉS de que el usuario esperó la subida es gastarle su tiempo y
 * sus datos por una condición que se sabía desde antes de empezar.
 */

export interface AdjuntoEnCurso extends AdjuntoUI {
  subiendo?: boolean;
  error?: string;
}

export interface Capacidad {
  almacen: 'blob' | 'casa' | 'ninguno';
  tope: number;
  nota: string | null;
}

export interface Adjuntos {
  lista: AdjuntoEnCurso[];
  capacidad: Capacidad | null;
  /** Los que ya están arriba y se pueden mandar. */
  listos: AdjuntoUI[];
  agregar: (archivos: FileList | File[]) => Promise<void>;
  quitar: (id: string) => void;
  limpiar: () => void;
  /** Lo que se le dice al usuario cuando algo no se pudo: en español y con el número. */
  aviso: string | null;
  descartarAviso: () => void;
}

const SIN_ALMACEN: Capacidad = { almacen: 'ninguno', tope: 0, nota: null };

export function useAdjuntos(projectId: string | null): Adjuntos {
  const [lista, setLista] = useState<AdjuntoEnCurso[]>([]);
  const [capacidad, setCapacidad] = useState<Capacidad | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const contador = useRef(0);

  useEffect(() => {
    setLista([]);
    if (!projectId) {
      setCapacidad(null);
      return;
    }
    let vivo = true;
    fetch(`/api/projects/${projectId}/asistente/adjuntos`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setCapacidad(d?.almacen ? d : SIN_ALMACEN);
      })
      .catch(() => vivo && setCapacidad(SIN_ALMACEN));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const quitar = useCallback((id: string) => {
    setLista((l) => l.filter((a) => a.id !== id));
  }, []);

  const limpiar = useCallback(() => setLista([]), []);

  const agregar = useCallback(
    async (archivos: FileList | File[]) => {
      if (!projectId) return;
      const cola = Array.from(archivos);
      if (!cola.length) return;

      const cap = capacidad ?? SIN_ALMACEN;
      if (cap.almacen === 'ninguno') {
        setAviso(cap.nota ?? 'No hay dónde guardar archivos en este entorno.');
        return;
      }

      const problemas: string[] = [];

      for (const archivo of cola) {
        const veredicto = revisarArchivo(archivo.name, archivo.type || null, archivo.size);
        if (!veredicto.ok) {
          problemas.push(veredicto.motivo!);
          continue;
        }
        if (archivo.size > cap.tope) {
          problemas.push(
            `«${archivo.name}» pesa ${pesoLegible(archivo.size)} y aquí el tope son ${pesoLegible(cap.tope)}.${cap.nota ? ` ${cap.nota}` : ''}`,
          );
          continue;
        }

        // Un id provisional para poder pintar el chip "subiendo" antes de que
        // exista la fila en la base.
        const provisional = `subiendo-${++contador.current}`;
        setLista((l) => [
          ...l,
          {
            id: provisional,
            nombre: archivo.name,
            mime: archivo.type || 'application/octet-stream',
            size: archivo.size,
            url: '',
            subiendo: true,
          },
        ]);

        try {
          const subido =
            cap.almacen === 'blob'
              ? await subirABlob(projectId, archivo)
              : await subirALaCasa(projectId, archivo);
          setLista((l) => l.map((a) => (a.id === provisional ? subido : a)));
        } catch (e) {
          const motivo = e instanceof Error ? e.message : 'No se pudo subir.';
          setLista((l) =>
            l.map((a) => (a.id === provisional ? { ...a, subiendo: false, error: motivo } : a)),
          );
          problemas.push(`«${archivo.name}»: ${motivo}`);
        }
      }

      if (problemas.length) setAviso(problemas.join(' · '));
    },
    [capacidad, projectId],
  );

  return {
    lista,
    capacidad,
    listos: lista.filter((a) => !a.subiendo && !a.error && a.url),
    agregar,
    quitar,
    limpiar,
    aviso,
    descartarAviso: () => setAviso(null),
  };
}

async function subirABlob(projectId: string, archivo: File): Promise<AdjuntoEnCurso> {
  const { upload } = await import('@vercel/blob/client');
  const blob = await upload(`proyectos/${projectId}/${archivo.name}`, archivo, {
    access: 'public',
    handleUploadUrl: `/api/projects/${projectId}/asistente/adjuntos`,
    // Para lo grande, Blob lo parte en pedazos y los sube en paralelo. Sin
    // esto, un video de 200 MB es una sola petición que se cae con cualquier
    // parpadeo de la red y hay que volver a empezar desde cero.
    multipart: archivo.size > 8 * 1024 * 1024,
  });

  // El registro lo pide el navegador y no lo hace `onUploadCompleted`, porque
  // ese callback no se dispara en localhost: quedaría funcionando en
  // producción y roto en desarrollo.
  const res = await fetch(`/api/projects/${projectId}/asistente/adjuntos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrar: {
        url: blob.url,
        nombre: archivo.name,
        mime: archivo.type || blob.contentType || 'application/octet-stream',
        size: archivo.size,
      },
    }),
  });
  return await leerRespuesta(res);
}

async function subirALaCasa(projectId: string, archivo: File): Promise<AdjuntoEnCurso> {
  const datos = await aBase64(archivo);
  const res = await fetch(`/api/projects/${projectId}/asistente/adjuntos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archivo: { nombre: archivo.name, mime: archivo.type, datos },
    }),
  });
  return await leerRespuesta(res);
}

async function leerRespuesta(res: Response): Promise<AdjuntoEnCurso> {
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.archivo) throw new Error(d?.error ?? `No se pudo subir (HTTP ${res.status}).`);
  return { ...d.archivo, subiendo: false };
}

/**
 * `FileReader` y no `btoa(await file.text())`: `text()` destroza cualquier cosa
 * que no sea UTF-8 —o sea, cualquier imagen— y el PNG llega corrupto al otro
 * lado sin que nada falle por el camino.
 */
function aBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const r = String(lector.result ?? '');
      resolver(r.slice(r.indexOf(',') + 1));
    };
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });
}
