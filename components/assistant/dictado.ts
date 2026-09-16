'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictar en el compose, con lo que el navegador ya trae.
 *
 * `SpeechRecognition` existe en Chrome, Edge y Safari (ahí con prefijo
 * `webkit`) y NO existe en Firefox. Por eso `disponible` se calcula en un
 * efecto y no al render: preguntarle a `window` durante el render rompe la
 * hidratación, y pintar el botón siempre haría que en Firefox se viera un
 * micrófono que no hace nada.
 *
 * `interimResults` va encendido porque sin él el texto aparece de golpe al
 * terminar de hablar, y quien dicta necesita ver que lo está oyendo. Lo
 * provisional se devuelve aparte de lo confirmado: el compose pinta lo
 * confirmado y enseña lo provisional en gris, que es cómo se ve que la máquina
 * todavía no se decide.
 */

interface Reconocimiento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

export interface Dictado {
  disponible: boolean;
  escuchando: boolean;
  /** Lo que todavía no confirma el reconocedor. Se pinta en gris. */
  provisional: string;
  alternar: () => void;
  detener: () => void;
}

export function useDictado(alConfirmar: (texto: string) => void): Dictado {
  const [disponible, setDisponible] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [provisional, setProvisional] = useState('');
  const motor = useRef<Reconocimiento | null>(null);
  // El callback se guarda en una ref para que el reconocedor no haya que
  // volver a crearlo cada vez que el compose re-renderiza (o sea, en cada
  // tecla): recrearlo a media frase corta el dictado.
  const confirmar = useRef(alConfirmar);
  confirmar.current = alConfirmar;

  useEffect(() => {
    const w = window as unknown as Record<string, any>;
    const Motor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Motor) return;
    setDisponible(true);

    const r: Reconocimiento = new Motor();
    // Español de México: el reconocedor en "es-ES" escribe "vosotros" y se
    // pelea con los nombres de acá.
    r.lang = 'es-MX';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e: any) => {
      let enCurso = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trozo = e.results[i];
        const texto = trozo[0]?.transcript ?? '';
        if (trozo.isFinal) confirmar.current(texto);
        else enCurso += texto;
      }
      setProvisional(enCurso);
    };
    r.onerror = () => {
      setEscuchando(false);
      setProvisional('');
    };
    r.onend = () => {
      setEscuchando(false);
      setProvisional('');
    };

    motor.current = r;
    return () => {
      try {
        r.stop();
      } catch {
        // Parar algo que nunca arrancó tira en Safari. No importa.
      }
      motor.current = null;
    };
  }, []);

  const detener = useCallback(() => {
    try {
      motor.current?.stop();
    } catch {
      // Ver arriba.
    }
    setEscuchando(false);
    setProvisional('');
  }, []);

  const alternar = useCallback(() => {
    if (!motor.current) return;
    if (escuchando) {
      detener();
      return;
    }
    try {
      motor.current.start();
      setEscuchando(true);
    } catch {
      // Arrancar dos veces tira. Si ya estaba escuchando, no pasa nada.
    }
  }, [detener, escuchando]);

  return { disponible, escuchando, provisional, alternar, detener };
}
