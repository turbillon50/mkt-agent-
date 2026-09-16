/**
 * Pruebas de la corrida 1. No tocan la base ni la red: solo lógica pura.
 *
 *   npm run test:sales
 *
 * Los teléfonos de aquí son inventados a propósito: en el repo no entran datos
 * de personas reales.
 */
import { createHmac } from 'node:crypto';
import { normalizePhone, scoreLead, toE164, ladaOf } from '../src/sales/scoring';
import { isForwardStage, resolveRules, DEFAULT_RULES } from '../src/sales/types';
import { hardEscalation } from '../src/sales/escalation';
import { isNoWhatsappError, parseWebhook } from '../lib/whatsapp-cloud';
import { mapLeadgenFields, parseLeadgenWebhook, verifyChallenge, verifySignature } from '../lib/meta-graph';

let pasadas = 0;
const fallas: string[] = [];

function check(nombre: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) pasadas++;
  else fallas.push(`${nombre}\n    esperado: ${b}\n    obtenido: ${a}`);
}

// --- Fecha fija: sin esto el bono de "acaba de entrar" hace la prueba floja.
const AHORA = new Date('2026-09-16T00:00:00Z');
const HACE_DOS_DIAS = new Date('2026-09-14T00:00:00Z');
const HACE_MEDIA_HORA = new Date('2026-09-15T23:30:00Z');
const HACE_SEIS_HORAS = new Date('2026-09-15T18:00:00Z');

// ---------------------------------------------------------------------------
// normalizePhone — puerto de `normaliza`
// ---------------------------------------------------------------------------
check('normaliza 10 dígitos MX', normalizePhone('9981234567'), { e164: '529981234567', national: '9981234567', country: 'MX' });
check('normaliza con 52 al frente', normalizePhone('+52 998 123 4567'), { e164: '529981234567', national: '9981234567', country: 'MX' });
check('normaliza el 521 viejo', normalizePhone('5219981234567'), { e164: '529981234567', national: '9981234567', country: 'MX' });
check('normaliza EE. UU.', normalizePhone('1 305 555 0143'), { e164: '13055550143', national: '3055550143', country: 'US' });
check('normaliza basura', normalizePhone('123'), { e164: '123', national: '123', country: 'OTRO' });
check('normaliza vacío', normalizePhone(null), { e164: '', national: '', country: 'OTRO' });
check('toE164 pone el más', toE164('9981234567'), '+529981234567');
check('toE164 con vacío es null', toE164(''), null);
check('lada de 3 dígitos gana', ladaOf('9981234567'), '998');
check('lada de 2 dígitos', ladaOf('5512345678'), '55');

// ---------------------------------------------------------------------------
// scoreLead — puerto de `califica`. Base 40 y clamp 0-100.
// ---------------------------------------------------------------------------
const us = scoreLead({ fullName: 'Maria Lopez', phone: '13055550143', createdAt: HACE_DOS_DIAS, now: AHORA });
check('EE. UU. + nombre completo = 80/A', [us.score, us.grade, us.zone], [80, 'A', 'Estados Unidos']);
check('EE. UU. deja su señal', us.signals, ['Número de Estados Unidos']);

const cdmx = scoreLead({ fullName: 'Juan Perez', phone: '5512345678', createdAt: HACE_DOS_DIAS, now: AHORA });
check('alto ingreso = 70/A', [cdmx.score, cdmx.grade, cdmx.zone], [70, 'A', 'Ciudad de México']);

const cancun = scoreLead({ fullName: 'Ana Ruiz', phone: '9981234567', createdAt: HACE_DOS_DIAS, now: AHORA });
check('Caribe = 65/B', [cancun.score, cancun.grade, cancun.zone], [65, 'B', 'Cancún, Quintana Roo']);

const frontera = scoreLead({ fullName: 'Luis Mora', phone: '8991234567', createdAt: HACE_DOS_DIAS, now: AHORA });
check('frontera = 60/B', [frontera.score, frontera.grade, frontera.zone], [60, 'B', 'Reynosa, Tamaulipas']);

const otra = scoreLead({ fullName: 'Rosa Diaz', phone: '9511234567', createdAt: HACE_DOS_DIAS, now: AHORA });
check('otra zona = 50/B', [otra.score, otra.grade, otra.zone], [50, 'B', 'Oaxaca']);

const incompleto = scoreLead({ fullName: 'Rosa', phone: '9511234567', createdAt: HACE_DOS_DIAS, now: AHORA });
check('nombre incompleto resta 15 = 25/C', [incompleto.score, incompleto.grade], [25, 'C']);
check('nombre incompleto deja su señal', incompleto.signals, ['Nombre incompleto']);

const sinVocales = scoreLead({ fullName: 'xyz', phone: '9511234567', createdAt: HACE_DOS_DIAS, now: AHORA });
check('nombre sin vocales resta 10 más', sinVocales.score, 15);
check('señales de nombre raro', sinVocales.signals, ['Nombre incompleto', 'Nombre raro, revisar']);

const recien = scoreLead({ fullName: 'Ana Ruiz', phone: '9981234567', createdAt: HACE_MEDIA_HORA, now: AHORA });
check('recién entrado suma 10 = 75/A', [recien.score, recien.grade], [75, 'A']);
check('recién entrado deja su señal', recien.signals.includes('Acaba de entrar'), true);

const fresco = scoreLead({ fullName: 'Ana Ruiz', phone: '9981234567', createdAt: HACE_SEIS_HORAS, now: AHORA });
check('menos de 12 h suma 5 y NO deja señal', [fresco.score, fresco.signals], [70, ['Conoce la zona']]);

// "Teléfono de largo raro" es rama MUERTA, igual que en el Python original:
// normaliza() solo devuelve country='MX' cuando el nacional trae 10 dígitos, así
// que la condición (length !== 10 && MX) no se cumple nunca. Se porta tal cual
// para no cambiar puntajes históricos; queda anotado en la entrega.
const corto = scoreLead({ fullName: 'Ana Ruiz', phone: '55123456', createdAt: HACE_DOS_DIAS, now: AHORA });
check('teléfono corto cae en OTRO, no en MX', corto.country, 'OTRO');
check('la señal de largo raro no se dispara (rama muerta heredada)', corto.signals.includes('Teléfono de largo raro'), false);

const pisoCero = scoreLead({ fullName: '', phone: '', createdAt: HACE_DOS_DIAS, now: AHORA });
check('el puntaje nunca baja de 0', pisoCero.score, 15);

// ---------------------------------------------------------------------------
// Reglas y etapas
// ---------------------------------------------------------------------------
check('reglas por defecto: propone, no manda', [DEFAULT_RULES.auto_reply, DEFAULT_RULES.auto_first_contact], [false, false]);
check('Twilio arranca en trial', resolveRules(null).twilio_mode, 'trial');
check('las reglas del proyecto pisan el default', resolveRules({ no_contact_hours: 6 }).no_contact_hours, 6);
check('la etapa avanza', isForwardStage('nuevo', 'contactado'), true);
check('la etapa no retrocede sola', isForwardStage('interesado', 'contactado'), false);
check('se puede perder desde cualquier lado', isForwardStage('interesado', 'perdido'), true);
check('de cerrado no se sale', isForwardStage('cerrado', 'perdido'), false);

// ---------------------------------------------------------------------------
// Escalación dura del vendedor (no depende del modelo)
// ---------------------------------------------------------------------------
check('un monto escala', hardEscalation('traigo $2,500,000 listos'), 'menciona un monto');
check('"2 millones" escala', hardEscalation('ando viendo algo de 2 millones'), 'menciona un monto');
check('pedir asesor escala', hardEscalation('me pueden pasar con un asesor'), 'señal de compra o pide hablar con alguien');
check('querer comprar escala', hardEscalation('quiero comprar un depa'), 'señal de compra o pide hablar con alguien');
check('una pregunta suelta no escala', hardEscalation('hola, qué tal'), null);

// ---------------------------------------------------------------------------
// Firma de webhooks
// ---------------------------------------------------------------------------
const SECRETO = 'secreto-de-prueba';
const CUERPO = '{"object":"page","entry":[]}';
const FIRMA = 'sha256=' + createHmac('sha256', SECRETO).update(CUERPO, 'utf8').digest('hex');
check('firma buena pasa', verifySignature(CUERPO, FIRMA, SECRETO), true);
check('firma mala truena', verifySignature(CUERPO, 'sha256=00ff', SECRETO), false);
check('cuerpo alterado truena', verifySignature(CUERPO + ' ', FIRMA, SECRETO), false);
check('sin encabezado truena', verifySignature(CUERPO, null, SECRETO), false);
check('sin app secret truena', verifySignature(CUERPO, FIRMA, ''), false);

const reto = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' });
check('handshake bueno', verifyChallenge(reto, 'tok'), { ok: true, challenge: '12345' });
check('handshake con token malo', verifyChallenge(reto, 'otro').ok, false);
check('handshake sin token configurado', verifyChallenge(reto, undefined).ok, false);

// ---------------------------------------------------------------------------
// Payload de ejemplo de Meta Lead Ads
// ---------------------------------------------------------------------------
const LEADGEN = {
  object: 'page',
  entry: [
    {
      id: '1173019489236259',
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: '9001',
            page_id: '1173019489236259',
            form_id: '2146578942620117',
            created_time: 1789000000,
          },
        },
        { field: 'feed', value: { item: 'status' } },
      ],
    },
  ],
};
const cambios = parseLeadgenWebhook(LEADGEN);
check('leadgen: solo el cambio de leadgen', cambios.length, 1);
check('leadgen: ids resueltos', [cambios[0]!.leadgenId, cambios[0]!.pageId, cambios[0]!.formId], ['9001', '1173019489236259', '2146578942620117']);
check('leadgen: payload vacío no truena', parseLeadgenWebhook({}), []);

const campos = mapLeadgenFields({
  created_time: '2026-09-15T18:00:00+0000',
  platform: 'ig',
  form_id: '2146578942620117',
  field_data: [
    { name: 'full_name', values: ['Ana Ruiz'] },
    { name: 'phone_number', values: ['+52 998 123 4567'] },
    { name: 'email', values: ['ana@ejemplo.mx'] },
  ],
});
check('leadgen: nombre y teléfono', [campos.fullName, campos.phone, campos.email], ['Ana Ruiz', '+52 998 123 4567', 'ana@ejemplo.mx']);
check('leadgen: plataforma ig = Instagram', campos.platform, 'Instagram');
check('leadgen: fecha original respetada', campos.createdAt.toISOString(), '2026-09-15T18:00:00.000Z');
check('leadgen: campos en MAYÚSCULAS también', mapLeadgenFields({ field_data: [{ name: 'FULL_NAME', values: ['Juan Perez'] }] }).fullName, 'Juan Perez');

// ---------------------------------------------------------------------------
// Payload de ejemplo de WhatsApp Cloud API
// ---------------------------------------------------------------------------
const WA = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '529981234567', phone_number_id: 'PHONE-1' },
            contacts: [{ profile: { name: 'Ana Ruiz' }, wa_id: '529981234567' }],
            messages: [
              { from: '529981234567', id: 'wamid.AAA', timestamp: '1789000000', type: 'text', text: { body: '¿Cuánto cuesta?' } },
            ],
          },
        },
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: 'PHONE-1' },
            statuses: [
              { id: 'wamid.BBB', status: 'failed', recipient_id: '525599990000', errors: [{ code: 131026, title: 'Message undeliverable' }] },
              { id: 'wamid.CCC', status: 'read', recipient_id: '529981234567' },
            ],
          },
        },
      ],
    },
  ],
};
const wa = parseWebhook(WA);
check('wa: un inbound', wa.inbound.length, 1);
check('wa: texto y remitente', [wa.inbound[0]!.from, wa.inbound[0]!.body, wa.inbound[0]!.profileName], ['529981234567', '¿Cuánto cuesta?', 'Ana Ruiz']);
check('wa: phone_number_id para resolver proyecto', wa.inbound[0]!.phoneNumberId, 'PHONE-1');
check('wa: dos acuses', wa.statuses.length, 2);
check('wa: el failed trae su código', [wa.statuses[0]!.status, wa.statuses[0]!.errorCode], ['failed', 131026]);
check('wa: 131026 = el número no tiene WhatsApp', isNoWhatsappError(131026), true);
check('wa: 131047 (ventana cerrada) NO es "sin WhatsApp"', isNoWhatsappError(131047), false);
check('wa: payload vacío no truena', parseWebhook({}), { inbound: [], statuses: [] });
check(
  'wa: mensaje interactivo se lee',
  parseWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PHONE-1' },
              messages: [
                { from: '52999', id: 'wamid.DDD', timestamp: '1789000000', type: 'interactive', interactive: { button_reply: { title: 'Sí, me interesa' } } },
              ],
            },
          },
        ],
      },
    ],
  }).inbound[0]!.body,
  'Sí, me interesa',
);

// ---------------------------------------------------------------------------
console.log(`\n${pasadas} pruebas pasadas, ${fallas.length} fallidas`);
for (const f of fallas) console.error(`  FALLA ${f}`);
process.exit(fallas.length > 0 ? 1 : 0);
