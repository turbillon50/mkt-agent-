/**
 * Calificación de leads — puerto EXACTO de /root/leads-app/sincroniza.py
 * (funciones `normaliza`, `lada_de` y `califica`). Mismos catálogos de LADA,
 * mismos pesos, mismo clamp 0-100 y mismos cortes de grado.
 *
 * Si algún día cambia el criterio, cambia AQUÍ: el panel Python se apaga.
 */

import type { LeadGrade } from './types';

// LADA -> zona y peso. Fuente: plan de numeración de México.
export const ALTO_INGRESO: Record<string, string> = {
  '55': 'Ciudad de México',
  '33': 'Guadalajara, Jalisco',
  '81': 'Monterrey, Nuevo León',
  '442': 'Querétaro',
  '222': 'Puebla',
  '449': 'Aguascalientes',
  '443': 'Morelia, Michoacán',
  '664': 'Tijuana, Baja California',
  '614': 'Chihuahua',
  '444': 'San Luis Potosí',
  '228': 'Xalapa, Veracruz',
};

export const CERCA_CARIBE: Record<string, string> = {
  '998': 'Cancún, Quintana Roo',
  '984': 'Playa del Carmen, Quintana Roo',
  '987': 'Cozumel',
  '999': 'Mérida, Yucatán',
  '981': 'Campeche',
  '993': 'Villahermosa, Tabasco',
  '991': 'Yucatán',
  '968': 'Chiapas',
  '961': 'Tuxtla Gutiérrez, Chiapas',
  '983': 'Chetumal, Quintana Roo',
};

export const FRONTERA: Record<string, string> = {
  '899': 'Reynosa, Tamaulipas',
  '868': 'Matamoros, Tamaulipas',
  '656': 'Ciudad Juárez',
  '686': 'Mexicali',
};

export const OTRAS: Record<string, string> = {
  '776': 'Hidalgo',
  '951': 'Oaxaca',
  '644': 'Ciudad Obregón, Sonora',
  '294': 'Veracruz',
  '922': 'Coatzacoalcos, Veracruz',
  '924': 'Minatitlán, Veracruz',
  '243': 'Tlaxcala',
  '775': 'Hidalgo',
  '653': 'San Luis Río Colorado, Sonora',
  '771': 'Pachuca, Hidalgo',
  '469': 'Guanajuato',
  '238': 'Tehuacán, Puebla',
  '954': 'Costa de Oaxaca',
  '747': 'Chilpancingo, Guerrero',
};

export type Country = 'MX' | 'US' | 'OTRO';

export interface NormalizedPhone {
  /** E.164 sin el "+" (igual que el panel Python). */
  e164: string;
  /** Número nacional, sin código de país. */
  national: string;
  country: Country;
}

/** Puerto de `normaliza(tel)`. */
export function normalizePhone(raw: string | null | undefined): NormalizedPhone {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('521') && d.length === 13) d = '52' + d.slice(3);
  if (d.startsWith('52') && d.length === 12) return { e164: d, national: d.slice(2), country: 'MX' };
  if (d.length === 10) return { e164: '52' + d, national: d, country: 'MX' };
  if (d.startsWith('1') && d.length === 11) return { e164: d, national: d.slice(1), country: 'US' };
  return { e164: d, national: d, country: 'OTRO' };
}

/** E.164 con "+" — lo que pide Twilio y WhatsApp Cloud API. */
export function toE164(raw: string | null | undefined): string | null {
  const { e164 } = normalizePhone(raw);
  return e164 ? `+${e164}` : null;
}

/** Puerto de `lada_de(nac)`. */
export function ladaOf(national: string): string {
  for (const n of [3, 2]) {
    const p = national.slice(0, n);
    if (p in ALTO_INGRESO || p in CERCA_CARIBE || p in FRONTERA || p in OTRAS) return p;
  }
  return national.slice(0, 3);
}

export interface ScoreResult {
  score: number;
  grade: LeadGrade;
  signals: string[];
  zone: string;
  lada: string;
  country: Country;
}

/**
 * Puerto de `califica(...)`. Puntaje 0-100, cada punto con una razón que se
 * puede explicar. `createdAt` es la fecha del lead en Meta, no la de importación.
 */
export function scoreLead(input: {
  fullName: string | null | undefined;
  phone: string | null | undefined;
  createdAt: Date;
  now?: Date;
}): ScoreResult {
  const { national, country } = normalizePhone(input.phone);
  const name = input.fullName ?? '';
  const signals: string[] = [];
  let p = 40;
  let zone: string;
  const lada = ladaOf(national);

  if (country === 'US') {
    p += 30;
    signals.push('Número de Estados Unidos');
    zone = 'Estados Unidos';
  } else if (lada in ALTO_INGRESO) {
    p += 20;
    zone = ALTO_INGRESO[lada]!;
    signals.push('Ciudad de alto ingreso');
  } else if (lada in CERCA_CARIBE) {
    p += 15;
    zone = CERCA_CARIBE[lada]!;
    signals.push('Conoce la zona');
  } else if (lada in FRONTERA) {
    p += 10;
    zone = FRONTERA[lada]!;
    signals.push('Zona fronteriza');
  } else {
    zone = OTRAS[lada] ?? 'México';
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    p += 10;
  } else {
    p -= 15;
    signals.push('Nombre incompleto');
  }

  if (!/[aeiouAEIOU]/.test(name)) {
    p -= 10;
    signals.push('Nombre raro, revisar');
  }

  const now = input.now ?? new Date();
  const hours = (now.getTime() - input.createdAt.getTime()) / 3_600_000;
  if (hours < 1) {
    p += 10;
    signals.push('Acaba de entrar');
  } else if (hours < 12) {
    p += 5;
  }

  if (national.length !== 10 && country === 'MX') signals.push('Teléfono de largo raro');

  p = Math.max(0, Math.min(100, p));
  const grade: LeadGrade = p >= 70 ? 'A' : p >= 50 ? 'B' : 'C';
  return { score: p, grade, signals, zone, lada, country };
}
