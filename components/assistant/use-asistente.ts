'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * El estado del Asistente de un proyecto: hilo, mensajes, adjuntos y envío.
 *
 * Vive aparte de la pantalla porque hay DOS pantallas —el panel de escritorio
 * y el cajón de celular— y una sola conversación. Si cada una llevara su
 * estado, abrir el celular después del escritorio empezaría de cero.
 *
 * El envío es TRANSMITIDO: se pide `text/event-stream` y el texto se va
 * pegando conforme llega. Si el servidor contesta otra cosa (un error, un
 * JSON), no se rompe: se lee como JSON y se pinta igual. Un chat que se cae
 * porque el stream no era stream sería peor que uno que nunca transmitió.
 */

export interface AdjuntoUI {
  id: string;
  nombre: string;
  mime: string;
  size: number;
  url: string;
}

export interface MencionUI {
  tipo: string;
  id: string;
  etiqueta: string;
  detalle?: string | null;
}

export interface PiezaUI {
  id: string;
  url: string;
  angulo: string;
}

export interface MensajeUI {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  piezas?: PiezaUI[];
  publicado?: string | null;
  adjuntos?: AdjuntoUI[];
  menciones?: MencionUI[];
}

export interface ConversacionUI {
  id: string;
  titulo: string;
  mensajes: number;
  actualizado: string;
}

export interface EnvioExtra {
  adjuntos?: AdjuntoUI[];
  menciones?: MencionUI[];
  autonomia?: 'propone' | 'publica';
  pantalla?: string | null;
}

export interface Asistente {
  mensajes: MensajeUI[];
  conversationId: string | null;
  pensando: boolean;
  /** "Goossip está leyendo brochure.pdf…" — lo que se enseña mientras trabaja. */
  trabajando: string | null;
  enviar: (texto: string, extra?: EnvioExtra) => Promise<void>;
  detener: () => void;
  nuevaConversacion: () => Promise<void>;
  abrirConversacion: (id: string) => Promise<void>;
  conversaciones: ConversacionUI[];
  cargarConversaciones: (q?: string) => Promise<void>;
  borrarConversacion: (id: string) => Promise<void>;
}

/** Lo que se enseña mientras el servidor lee los adjuntos. */
function fraseDeTrabajo(adjuntos: AdjuntoUI[]): string {
  if (!adjuntos.length) return 'Goossip está pensando…';
  if (adjuntos.length === 1) return `Goossip está leyendo ${adjuntos[0]!.nombre}…`;
  return `Goossip está leyendo ${adjuntos.length} archivos…`;
}

export function useAsistente(projectId: string | null): Asistente {
  const [mensajes, setMensajes] = useState<MensajeUI[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pensando, setPensando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [conversaciones, setConversaciones] = useState<ConversacionUI[]>([]);
  const aborto = useRef<AbortController | null>(null);

  // Cambiar de proyecto es cambiar de conversación. Sin esto, el hilo del
  // cliente A se quedaba pintado dentro del panel del cliente B hasta que
  // llegaba la respuesta del servidor — medio segundo de ver lo que no es tuyo.
  useEffect(() => {
    setMensajes([]);
    setConversationId(null);
    setConversaciones([]);
    if (!projectId) return;
    let vivo = true;
    fetch(`/api/projects/${projectId}/asistente`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setConversationId(d.conversationId ?? null);
        setMensajes(Array.isArray(d.mensajes) ? d.mensajes : []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const cargarConversaciones = useCallback(
    async (q?: string) => {
      if (!projectId) return;
      const url = `/api/projects/${projectId}/asistente/conversaciones${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const d = await res.json().catch(() => null);
      setConversaciones(Array.isArray(d?.conversaciones) ? d.conversaciones : []);
    },
    [projectId],
  );

  const abrirConversacion = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/asistente?conversation=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      ).catch(() => null);
      if (!res?.ok) return;
      const d = await res.json().catch(() => null);
      setConversationId(d?.conversationId ?? id);
      setMensajes(Array.isArray(d?.mensajes) ? d.mensajes : []);
    },
    [projectId],
  );

  const nuevaConversacion = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/asistente/conversaciones`, {
      method: 'POST',
    }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    setConversationId(d?.id ?? null);
    setMensajes([]);
    void cargarConversaciones();
  }, [cargarConversaciones, projectId]);

  const borrarConversacion = useCallback(
    async (id: string) => {
      if (!projectId) return;
      await fetch(`/api/projects/${projectId}/asistente/conversaciones/${id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      setConversaciones((c) => c.filter((x) => x.id !== id));
      if (id === conversationId) {
        setConversationId(null);
        setMensajes([]);
      }
    },
    [conversationId, projectId],
  );

  const detener = useCallback(() => {
    aborto.current?.abort();
    aborto.current = null;
    setPensando(false);
    setTrabajando(null);
  }, []);

  const enviar = useCallback(
    async (texto: string, extra: EnvioExtra = {}) => {
      const adjuntos = extra.adjuntos ?? [];
      if (!projectId || pensando) return;
      if (!texto.trim() && !adjuntos.length) return;

      setMensajes((m) => [
        ...m,
        { role: 'user', content: texto, adjuntos, menciones: extra.menciones ?? [] },
      ]);
      setPensando(true);
      setTrabajando(fraseDeTrabajo(adjuntos));

      const control = new AbortController();
      aborto.current = control;

      try {
        const res = await fetch(`/api/projects/${projectId}/asistente`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          signal: control.signal,
          body: JSON.stringify({
            mensaje: texto,
            conversationId,
            adjuntos: adjuntos.map((a) => a.id),
            menciones: (extra.menciones ?? []).map((m) => ({
              tipo: m.tipo,
              id: m.id,
              etiqueta: m.etiqueta,
            })),
            autonomia: extra.autonomia ?? 'propone',
            pantalla: extra.pantalla ?? null,
          }),
        });

        const tipo = res.headers.get('content-type') ?? '';
        if (!res.ok || !tipo.includes('text/event-stream') || !res.body) {
          const d = await res.json().catch(() => null);
          setMensajes((m) => [
            ...m,
            { role: 'assistant', content: d?.respuesta ?? d?.error ?? 'No pude contestar.', piezas: d?.piezas ?? [], publicado: d?.publicado ?? null },
          ]);
          if (d?.conversationId) setConversationId(d.conversationId);
          return;
        }

        // El hueco donde se va pegando lo que llega. Se crea AQUÍ y no al
        // recibir el primer token: sin él, el "está pensando" desaparece y no
        // aparece nada en su lugar hasta el primer token, y ese hueco se lee
        // como que se colgó.
        setMensajes((m) => [...m, { role: 'assistant', content: '', piezas: [] }]);

        await leerSSE(res.body, (evento, dato) => {
          if (evento === 'hilo' && dato?.conversationId) {
            setConversationId(dato.conversationId);
          } else if (evento === 'texto' && typeof dato?.delta === 'string') {
            // El aviso de "está leyendo…" se apaga con el primer texto de
            // verdad, no al crear la burbuja: mientras el modelo piensa, el
            // panel tiene que seguir diciendo qué está haciendo.
            setTrabajando(null);
            setMensajes((m) => pegarEnElUltimo(m, dato.delta));
          } else if (evento === 'fin') {
            setMensajes((m) => cerrarElUltimo(m, dato?.piezas ?? [], dato?.publicado ?? null));
            if (dato?.conversationId) setConversationId(dato.conversationId);
          } else if (evento === 'estado' && typeof dato?.texto === 'string') {
            setTrabajando(dato.texto);
          } else if (evento === 'error' && typeof dato?.mensaje === 'string') {
            setTrabajando(null);
            setMensajes((m) => pegarEnElUltimo(m, `\n\n**No pude terminar:** ${dato.mensaje}`));
          }
        });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          setMensajes((m) => pegarEnElUltimo(m, '\n\n_(lo paraste)_'));
        } else {
          setMensajes((m) => [
            ...m,
            { role: 'assistant', content: 'Se cayó la conexión. Inténtalo otra vez.' },
          ]);
        }
      } finally {
        aborto.current = null;
        setPensando(false);
        setTrabajando(null);
      }
    },
    [conversationId, pensando, projectId],
  );

  return {
    mensajes,
    conversationId,
    pensando,
    trabajando,
    enviar,
    detener,
    nuevaConversacion,
    abrirConversacion,
    conversaciones,
    cargarConversaciones,
    borrarConversacion,
  };
}

function pegarEnElUltimo(mensajes: MensajeUI[], delta: string): MensajeUI[] {
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo || ultimo.role !== 'assistant') {
    return [...mensajes, { role: 'assistant', content: delta, piezas: [] }];
  }
  return [...mensajes.slice(0, -1), { ...ultimo, content: ultimo.content + delta }];
}

function cerrarElUltimo(
  mensajes: MensajeUI[],
  piezas: PiezaUI[],
  publicado: string | null,
): MensajeUI[] {
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo || ultimo.role !== 'assistant') return mensajes;
  return [...mensajes.slice(0, -1), { ...ultimo, piezas, publicado }];
}

/**
 * Lee un `text/event-stream` a mano.
 *
 * No se usa `EventSource` porque solo sabe hacer GET y esto es un POST con
 * cuerpo. Lo que hay que respetar del formato es una cosa: los eventos se
 * separan con DOS saltos de línea, y un pedazo del stream puede cortar un
 * evento a la mitad. Por eso hay buffer y no un `split` por evento.
 */
async function leerSSE(
  cuerpo: ReadableStream<Uint8Array>,
  alRecibir: (evento: string, dato: any) => void,
): Promise<void> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });

    let corte: number;
    while ((corte = buffer.indexOf('\n\n')) >= 0) {
      const bloque = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);

      let evento = 'message';
      const datos: string[] = [];
      for (const linea of bloque.split('\n')) {
        if (linea.startsWith('event:')) evento = linea.slice(6).trim();
        else if (linea.startsWith('data:')) datos.push(linea.slice(5).trim());
      }
      if (!datos.length) continue;
      try {
        alRecibir(evento, JSON.parse(datos.join('\n')));
      } catch {
        // Un evento ilegible no tumba el resto del stream.
      }
    }
  }
}
