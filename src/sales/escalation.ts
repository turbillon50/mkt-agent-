/**
 * Red de seguridad determinista del vendedor.
 *
 * Si el lead trae dinero en la mano o pide hablar con una persona, NO se deja
 * en manos del modelo decidir si avisa: escala siempre. Vive aparte del agente
 * para poder probarse sin base de datos ni proveedor de IA.
 */

const BUY_SIGNALS =
  /\b(compr\w+|invers\w+|invert\w+|aparta\w+|enganch\w+|financ\w+|cr[ée]dito|contad|escritur\w+|firmar|asesor|vendedor|humano|persona|llam\w+|whats?app|agend\w+|cita)\b/i;

/** Un monto explícito: "$1,500,000", "2 millones", "500 mil usd". */
const MONEY = /(\$\s?\d[\d,.]{2,})|(\b\d[\d,.]*\s?(mil|millones|mdp|k|usd|dólares|dolares|pesos)\b)/i;

/** Devuelve el motivo por el que hay que meter a un humano, o null. */
export function hardEscalation(text: string): string | null {
  if (MONEY.test(text)) return 'menciona un monto';
  if (BUY_SIGNALS.test(text)) return 'señal de compra o pide hablar con alguien';
  return null;
}
