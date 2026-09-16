/**
 * Las banderas de la app, en un solo lugar.
 *
 * Vive en `src/` (no en `lib/`) porque la leen las pruebas y los scripts de tsx
 * fuera de Next, donde `server-only` revienta.
 *
 * Una bandera se lee SIEMPRE por función y nunca por `process.env.X === 'true'`
 * suelto, por una razón medida: Vercel devuelve el literal `[SENSITIVE]` cuando
 * la variable está marcada como sensible, y `.env.local` de este proyecto trae
 * hoy `WHATSAPP_ENABLED="[SENSITIVE]"`. Con una comparación a mano en cinco
 * archivos distintos, basta con que uno la escriba al revés (`!== 'false'`)
 * para que la función apagada se encienda sola en producción.
 */

/** true SOLO con un sí explícito. Cualquier otra cosa —vacío, `[SENSITIVE]`, basura— es no. */
function encendida(nombre: string, porOmision = false): boolean {
  const raw = (process.env[nombre] ?? '').trim();
  if (!raw || raw.startsWith('[') || raw.startsWith('<')) return porOmision;
  return /^(1|true|yes|on|si|sí)$/i.test(raw);
}

/**
 * WhatsApp: APAGADO por omisión, por decisión de Luis (16-sep-2026).
 *
 * "WhatsApp va al final". No es que el código no exista —el puente, la cola y
 * las plantillas están escritos desde la corrida 1— es que **no se enseña ni se
 * ejecuta** mientras no haya WABA en Business Manager y Twilio fuera de Trial.
 * Enseñar un botón que encola mensajes que nunca van a salir es peor que no
 * tenerlo: el usuario cree que ya contactó a sus leads.
 *
 * Y se apaga en los TRES lugares, no solo en la pantalla: la caja de Leads, la
 * ruta que encola y la herramienta del Asistente. Esconder el botón y dejar la
 * ruta viva no es apagar nada — es esconder el interruptor.
 */
export function whatsappHabilitado(): boolean {
  return encendida('WHATSAPP_ENABLED', false);
}

/**
 * Meta Ads con la app propia de Goossip: ENCENDIDO por omisión (corrida 11).
 *
 * La bandera no es la puerta — la puerta son `META_APP_ID` y `META_APP_SECRET`,
 * que es lo que de verdad decide si hay con qué conectar (ver `channelAvailable`
 * en `src/projects/connections.ts`). Existe para poder APAGARLO en caliente sin
 * un deploy el día que Meta cierre la app o caduque la revisión de permisos,
 * que es el riesgo real de un conector que depende de una app nuestra.
 *
 * Por eso el valor por omisión es `true` y no `false`: un entorno con las
 * credenciales puestas y sin esta variable debe conectar, no quedarse mudo.
 */
export function metaAdsHabilitado(): boolean {
  return encendida('META_ADS_ENABLED', true);
}

/** El mensaje único cuando algo de WhatsApp se pide con la bandera abajo. */
export const WHATSAPP_APAGADO =
  'WhatsApp todavía no está abierto en Goossip. Va al final, cuando el número del cliente esté dado de alta en Business Manager.';
