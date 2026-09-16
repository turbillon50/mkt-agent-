/**
 * El Asistente DE UN PROYECTO.
 *
 * Reemplaza a `askWithHistoryForCampaign` de la corrida 5, que armaba un agente
 * por "campaña" pero cuyas tools no sabían de ningún proyecto y publicaban con
 * la cuenta de la casa. Aquí el agente se arma por petición con las tools ya
 * atadas al proyecto (`toolsParaProyecto`), así que no existe la posibilidad de
 * que una acción salga sin proyecto.
 *
 * El agente global sigue existiendo en `index.ts` para el runner y el
 * contestador de WhatsApp, que corren sin nadie mirando. Lo que se fue es el
 * CHAT global: el usuario ya no puede hablar con un Goossip que no sabe de qué
 * cliente le están hablando.
 */
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config';
import { buildOperatorManifesto } from './manifesto';
import { getMastraMemory, memoryIdsFor } from './memory';
import { askGeminiVision } from '../../lib/gemini-vision';
import { fichaDelProyecto, type AgentContext } from './project-context';
import { toolsParaProyecto } from './project-tools';
import { guiaComoTexto, pendientesDelProyecto } from '../assistant/guia';
import { autonomiaEfectiva, type Autonomia } from '../assistant/autonomia';
// La regla dura vive aparte y sin imports, para poder probarla con tsx sin
// levantar Mastra ni `server-only`. Ver src/agent/verdad.ts.
import { garantizarVerdad, SIN_ENLACE } from './verdad';

export type { Autonomia };
export { garantizarVerdad, SIN_ENLACE };

function buildModel() {
  if (!config.openrouter.apiKey) throw new Error('MESH_API_KEY no está puesta.');
  const provider = createOpenAI({
    apiKey: config.openrouter.apiKey,
    baseURL: config.openrouter.baseUrl,
  });
  return provider.chat(config.openrouter.modelAgent);
}

const MODEL_SETTINGS = { maxOutputTokens: config.openrouter.minMaxTokens || 800 };
const memory = getMastraMemory();

export type Turno = { role: 'user' | 'assistant'; content: string };

export interface RespuestaAsistente {
  texto: string;
  /** Las piezas que se hicieron en este turno, para pintarlas en el panel. */
  piezas: Array<{ id: string; url: string; angulo: string }>;
  /** La URL de lo que se publicó, si se publicó. */
  publicado: string | null;
}

/**
 * Las reglas que NO están en el manifiesto general porque solo aplican cuando
 * Goossip habla dentro de un proyecto. Van al final de las instrucciones, que
 * es donde el modelo las lee últimas.
 */
function reglasDelProyecto(ctx: AgentContext): string {
  return `
## Dónde estás parado

${fichaDelProyecto(ctx)}

## Lo que no se negocia

- Todo lo que hagas es de ESTE proyecto y sale con SUS cuentas. Nunca publiques
  con "la cuenta de la casa" ni con la de otro cliente.
- Si te piden publicar en una red que este proyecto no tiene conectada, dilo
  claro: "${ctx.project.name} no tiene esa red conectada" y manda a Conexiones.
  No lo intentes por otro lado.
- Cuando escribas un post, OFRECE la pieza. Un post sin imagen rinde la mitad y
  el usuario no tiene por qué saber que se la puedes hacer. **Pero ofrecer no es
  esperar**: si el usuario ya dijo "hazlo ya", "no me preguntes más" o "publícalo
  de una vez", PUBLICA en ese mismo turno y menciona la imagen después. Pedir
  permiso a quien acaba de decir que no se lo pidas es desobedecer, no ser
  prudente.
- Si el encargo nombra dos o más redes, usa \`hacer-paquete-social\`: cada red
  lleva copy, headline, CTA, formato y arte propios. Está prohibido reciclar la
  misma imagen o pegar el mismo texto en todas.
- Si el usuario pide PUBLICAR con arte, crea primero la pieza de ESA red y pasa
  su id a \`publicar-post\`. X también publica la imagen; no lo reduzcas a texto.
- Nunca des UNA sola opción de pieza. Siempre son dos o tres y el usuario elige.
- Si te preguntan medidas de una red, usa la herramienta y CITA la fuente con su
  fecha. No las digas de memoria.
- Respeta el bloque de Autonomía de este turno: en PROPONE exige aprobación del
  texto y la pieza; en PUBLICA SOLO ejecuta lo pedido sin volver a preguntar.

## La regla dura: lo que diga la herramienta

Tu respuesta final se construye con el RESULTADO de las herramientas, no con lo
que te parezca que pasó.

- Si \`publicar-post\` devolvió \`publicado: true\`, **se publicó**. Di que se
  publicó y pega la \`externalUrl\`. Está prohibido decir que falló, que hubo un
  error, que era contenido duplicado o cualquier variante: quien lea eso va a
  volver a publicar y le va a salir doble.
- Si una herramienta lanzó un error, di ESE error, no uno inventado.
- Nunca narres un resultado que no viste en una herramienta.`;
}

/** El selector de autonomía del compose, convertido en regla. */
function reglasDeAutonomia(autonomia: Autonomia): string {
  if (autonomia === 'publica') {
    return `
## Autonomía: PUBLICA SOLO

El usuario te dio permiso de ejecutar sin pedirle confirmación en cada paso.
- Si te pide algo que se puede hacer, HAZLO y después reporta qué hiciste y
  dónde quedó, con la liga.
- Lo que sigue estando prohibido: publicar en una red que este proyecto no
  tiene conectada, y mandar mensajes a personas que el usuario no nombró.
- Si lo que te piden es ambiguo (dos redes posibles, dos piezas posibles), no
  adivines: pregunta. "Publica solo" es permiso para no pedir permiso, no para
  acertarle al volado.`;
  }
  return `
## Autonomía: PROPONE

- No publiques nada sin que el usuario haya dicho que sí a ESE texto y a ESA
  pieza. Enséñale primero lo que va a salir, tal cual va a salir.
- Lo mismo con mandar mensajes a un lead: primero el borrador, luego el envío.`;
}

/** Lo que Goossip LEYÓ de los adjuntos, puesto en las instrucciones del turno. */
function bloqueDeAdjuntos(adjuntos: AdjuntoLeido[]): string | null {
  if (!adjuntos.length) return null;

  const partes = adjuntos.map((a) => {
    const cabeza = `### ${a.nombre} (${a.mime})`;
    if (a.estado === 'leido' && a.texto) {
      return [cabeza, a.nota ? `_${a.nota}_` : null, '', a.texto].filter(Boolean).join('\n');
    }
    // Lo que no se pudo leer se dice con la MISMA frase que ve el usuario en el
    // chip. Si el modelo contesta sobre un archivo que nadie pudo abrir, el
    // usuario se entera cuando ya tomó una decisión con eso.
    return `${cabeza}\nNO SE PUDO LEER: ${a.nota ?? 'sin motivo registrado'}. Díselo al usuario con estas palabras y no contestes como si lo hubieras leído.`;
  });

  return `## Lo que el usuario adjuntó en este mensaje

Esto es el contenido REAL de los archivos, ya leído. Úsalo para contestar y
CITA de dónde sacaste cada cosa ("en la página 3 del brochure…"). Si te piden
guardar algo de esto, usa la herramienta de guardar conocimiento.

${partes.join('\n\n')}`;
}

export interface AdjuntoLeido {
  nombre: string;
  mime: string;
  estado: string;
  texto: string | null;
  nota: string | null;
}

export interface EntradaDelAsistente {
  ctx: AgentContext;
  historia: Turno[];
  mensaje: string;
  imagenDataUrl?: string | null;
  /** El id de usuario de la app, para la memoria conversacional. */
  userId?: string | null;
  /** Lo que se leyó de los archivos que trae este turno. */
  adjuntos?: AdjuntoLeido[];
  /** El bloque ya armado de lo que el usuario mencionó con `@`. */
  menciones?: string | null;
  /** El modo del selector. El servidor ya lo bajó a 'propone' si no puede operar. */
  autonomia?: Autonomia;
  /** La pantalla en la que está parado el usuario. */
  pantalla?: string | null;
}

async function armarInstrucciones(input: EntradaDelAsistente): Promise<string> {
  const { ctx } = input;

  const marca = {
    name: ctx.project.name,
    voice: ctx.project.brandVoice ?? config.brand.voice,
    topics: (ctx.project.brandTopics ?? config.brand.topics.join(','))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    language: ctx.project.brandLanguage ?? config.brand.language,
  };

  const [estado, lecciones] = await Promise.all([
    pendientesDelProyecto({
      orgId: ctx.orgId,
      project: ctx.project,
      kit: ctx.kit,
    }).catch(() => null),
    /**
     * Lo que este cliente ya le corrigió a Goossip.
     *
     * Van al SYSTEM y no a una tool: una lección que hay que ir a buscar es una
     * lección que el modelo solo va a mirar cuando se acuerde de que existe, y
     * justo lo que se quiere evitar es que repita el error sin darse cuenta.
     * Se buscan por parecido al mensaje del usuario, así que las ocho que entran
     * son las que tienen que ver con lo que se está pidiendo ahora.
     */
    import('../autonomia/lecciones')
      .then((m) => m.leccionesParecidas(ctx.project.id, input.mensaje, 8))
      .catch(() => []),
  ]);

  const { leccionesComoTexto } = await import('../autonomia/lecciones');
  const { nivelComoTexto, puedeSolo } = await import('../autonomia/niveles');

  /*
   * DOS autonomías que no son la misma, y aquí es donde se juntan.
   *
   * El NIVEL (corrida 7) es del PROYECTO: lo pone el dueño en Ajustes, se gana
   * con racha y tiene techo. El SELECTOR (corrida 8) es del TURNO: lo mueve
   * quien escribe, en el compose, para este mensaje.
   *
   * El nivel manda. Un proyecto en nivel 1 dice "todo pasa por aprobación", y
   * si un interruptor de la barra de escribir pudiera saltárselo, el nivel no
   * sería un techo: sería una sugerencia. Así que "Publica solo" pide DOS
   * permisos —el rol de quien escribe y el nivel del proyecto— y con que falte
   * uno, el turno cae a "propone".
   *
   * Se rehace aquí aunque la ruta ya haya llamado a `autonomiaEfectiva`: es el
   * candado que sigue puesto el día que a esta función la llame un cron.
   */
  const publicarSaleSolo = puedeSolo(ctx.project, 'publicar_organico').puede;
  const autonomia = autonomiaEfectiva(input.autonomia, ctx.puedeOperar && publicarSaleSolo);

  return [
    buildOperatorManifesto(marca, ctx.project.manifesto ?? null),
    reglasDelProyecto(ctx),
    `## Hasta dónde puedes llegar solo\n\n${nivelComoTexto(ctx.project)}`,
    reglasDeAutonomia(autonomia),
    // La pantalla no es adorno: "dame de baja este lead" en /leads y en
    // /conexiones no quieren decir lo mismo, y preguntarlo es hacerle repetir
    // al usuario algo que la app ya sabe.
    input.pantalla ? `## Dónde está mirando el usuario\n\nEstá en la pantalla \`${input.pantalla}\`.` : null,
    estado ? `## Cómo está el proyecto hoy\n\n${guiaComoTexto(estado)}` : null,
    lecciones.length ? `## Lo que ya te corrigieron aquí\n\n${leccionesComoTexto(lecciones)}` : null,
    bloqueDeAdjuntos(input.adjuntos ?? []),
    input.menciones ?? null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function armarAgente(ctx: AgentContext, instrucciones: string) {
  return new Agent({
    id: `goossip-${ctx.project.id.slice(0, 8)}`,
    name: 'goossip',
    instructions: instrucciones,
    model: buildModel(),
    tools: toolsParaProyecto(ctx),
    ...(memory ? { memory } : {}),
  } as never);
}

function armarOpciones(input: EntradaDelAsistente): Record<string, unknown> {
  const opciones: Record<string, unknown> = { ...MODEL_SETTINGS };
  // La memoria conversacional se separa por (usuario, proyecto): el hilo con
  // el cliente A no puede aparecer contestando dentro del cliente B.
  if (memory && input.userId) {
    opciones.memory = memoryIdsFor(`${input.userId}:${input.ctx.project.id}`);
  }
  return opciones;
}

function armarMensajes(input: EntradaDelAsistente) {
  return [
    ...input.historia.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: input.mensaje },
  ];
}

export async function preguntarAlAsistente(
  input: EntradaDelAsistente,
): Promise<RespuestaAsistente> {
  const { ctx } = input;
  const instrucciones = await armarInstrucciones(input);

  // El Mesh no ve imágenes. Este camino queda para el `imagen` en data-url que
  // manda el cajón de celular; los adjuntos del compose de escritorio ya NO
  // pasan por aquí: se leen antes y entran como texto, que es lo que permite
  // conservar las herramientas en el mismo turno.
  if (input.imagenDataUrl) {
    const texto = await askGeminiVision(
      instrucciones,
      input.historia,
      input.mensaje,
      input.imagenDataUrl,
    );
    return { texto, piezas: [], publicado: null };
  }

  const agente = armarAgente(ctx, instrucciones);
  const resultado = await agente.generate(armarMensajes(input) as never, armarOpciones(input) as never);

  const publicado = extraerPublicado(resultado);
  return {
    // La instrucción de arriba pide la verdad; esto la GARANTIZA. Un system
    // prompt es una petición, y la QA ya midió al modelo ignorándola.
    texto: garantizarVerdad(extraerTexto(resultado), publicado),
    piezas: extraerPiezas(resultado),
    publicado,
  };
}

/* --------------------------------------------------------------------------
   En vivo
   -------------------------------------------------------------------------- */

export type EventoDelAsistente =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'fin'; respuesta: RespuestaAsistente }
  | { tipo: 'error'; mensaje: string };

/**
 * Lo mismo, pero soltando el texto según sale.
 *
 * Por qué importa y no es cosmético: una pieza tarda cerca de un minuto y un
 * post con su investigación tarda quince segundos. Un cuadro que dice
 * "Trabajando…" durante quince segundos se siente roto; ver la primera frase a
 * los dos segundos se siente rápido AUNQUE tarde lo mismo. Es el único cambio
 * de esta corrida que no agrega ninguna capacidad y aun así es de los que más
 * se notan.
 *
 * Si el modelo no sabe transmitir —o el proveedor no lo permite— esto NO falla:
 * cae a `generate()` y suelta el texto completo de un golpe. Un chat que no
 * contesta porque no se pudo transmitir sería peor que uno que no transmite.
 */
export async function* conversarEnVivo(
  input: EntradaDelAsistente,
): AsyncGenerator<EventoDelAsistente> {
  const { ctx } = input;
  const instrucciones = await armarInstrucciones(input);

  if (input.imagenDataUrl) {
    const texto = await askGeminiVision(instrucciones, input.historia, input.mensaje, input.imagenDataUrl);
    yield { tipo: 'texto', delta: texto };
    yield { tipo: 'fin', respuesta: { texto, piezas: [], publicado: null } };
    return;
  }

  const agente = armarAgente(ctx, instrucciones);
  const mensajes = armarMensajes(input);
  const opciones = armarOpciones(input);

  let salida: any;
  try {
    salida = await (agente as any).stream(mensajes as never, opciones as never);
  } catch {
    const resultado = await agente.generate(mensajes as never, opciones as never);
    const publicado = extraerPublicado(resultado);
    const texto = garantizarVerdad(extraerTexto(resultado), publicado);
    yield { tipo: 'texto', delta: texto };
    yield {
      tipo: 'fin',
      respuesta: {
        texto,
        piezas: extraerPiezas(resultado),
        publicado,
      },
    };
    return;
  }

  let completo = '';
  const lector: ReadableStream<string> | undefined = salida?.textStream;
  if (lector && typeof lector.getReader === 'function') {
    const r = lector.getReader();
    try {
      while (true) {
        const { done, value } = await r.read();
        if (done) break;
        if (typeof value === 'string' && value) {
          completo += value;
          yield { tipo: 'texto', delta: value };
        }
      }
    } catch {
      // Un stream que se rompe a media frase no se traga: abajo se decide qué
      // hacer con lo que haya quedado.
    }
  } else {
    completo = await Promise.resolve(salida?.text).catch(() => '');
    if (completo) yield { tipo: 'texto', delta: completo };
  }

  // `toolResults` se resuelve cuando el stream terminó. Se espera DESPUÉS de
  // vaciar el texto: pedirlo antes deja al usuario mirando un cuadro vacío
  // mientras el modelo ya escribió.
  let toolResults = (await Promise.resolve(salida?.toolResults).catch(() => [])) ?? [];

  /*
   * EL STREAM NO DIO NADA. Y esto no es una rareza: medido el 16-sep-2026, el
   * Mesh contesta `502 {"error":"sin_motor"}` a CUALQUIER petición con
   * `stream: true` —tres de tres— y `200` a las mismas tres sin transmitir.
   * Mastra se traga ese error: no lanza, cierra el stream vacío y el usuario se
   * queda mirando una burbuja en blanco.
   *
   * Así que se vuelve a pedir sin transmitir, que es lo que sí funciona hoy. El
   * texto llega de un golpe —se pierde el efecto de escritura, no la
   * respuesta— y el día que el Mesh sepa transmitir, este camino deja de
   * usarse solo, sin tocar nada.
   *
   * La condición mira TAMBIÉN las tools: si el stream alcanzó a ejecutar algo
   * antes de morir, NO se reintenta. Repetir un turno que ya publicó publicaría
   * dos veces.
   */
  if (!completo.trim() && toolResults.length === 0) {
    const resultado = await agente.generate(mensajes as never, opciones as never);
    completo = extraerTexto(resultado);
    toolResults = ((resultado as unknown) as { toolResults?: typeof toolResults }).toolResults ?? [];
    if (completo) yield { tipo: 'texto', delta: completo };
  }

  const comoResultado = { text: completo, toolResults };

  if (!completo.trim()) {
    yield { tipo: 'error', mensaje: 'El modelo no devolvió nada. Vuelve a intentarlo.' };
  }

  const publicado = extraerPublicado(comoResultado);
  const textoFinal = garantizarVerdad(completo, publicado);

  yield {
    tipo: 'fin',
    respuesta: {
      texto: textoFinal,
      piezas: extraerPiezas(comoResultado),
      publicado,
    },
  };
}

function extraerTexto(resultado: unknown): string {
  const r = resultado as { text?: string; finalText?: string; content?: string };
  return r.text ?? r.finalText ?? r.content ?? '';
}

type LlamadaDeTool = { payload?: { toolName?: string; args?: any; result?: any } };

function llamadas(resultado: unknown): LlamadaDeTool[] {
  return (resultado as { toolResults?: LlamadaDeTool[] }).toolResults ?? [];
}

/** Las piezas que se hicieron en este turno, para pintarlas sin volver a pedirlas. */
function extraerPiezas(resultado: unknown): Array<{ id: string; url: string; angulo: string }> {
  const out: Array<{ id: string; url: string; angulo: string }> = [];
  for (const c of llamadas(resultado)) {
    const p = c?.payload;
    if (p?.toolName === 'hacerPieza' && Array.isArray(p.result?.opciones)) {
      for (const o of p.result.opciones) {
        if (o?.url) out.push({ id: String(o.id ?? ''), url: String(o.url), angulo: String(o.angulo ?? '') });
      }
    }
    if (p?.toolName === 'hacerPaqueteSocial' && Array.isArray(p.result?.redes)) {
      for (const red of p.result.redes) {
        for (const o of red?.opciones ?? []) {
          if (o?.url) out.push({ id: String(o.id ?? ''), url: String(o.url), angulo: `${red.red}: ${String(o.angulo ?? '')}` });
        }
      }
    }
    if (p?.toolName === 'fotoDeProducto' && p.result?.url) {
      out.push({ id: '', url: String(p.result.url), angulo: 'Higgsfield' });
    }
  }
  return out;
}

/**
 * La URL de lo que se publicó en este turno, o null.
 *
 * Manda `publicado`, no `url`: LinkedIn y Facebook siempre devuelven enlace,
 * pero Instagram puede publicar y no dar permalink en la misma llamada. Con la
 * versión vieja —que solo miraba `url`— un post real de Instagram se contaba
 * como "no se publicó", que es la misma mentira al revés.
 */
function extraerPublicado(resultado: unknown): string | null {
  for (const c of llamadas(resultado).slice().reverse()) {
    const p = c?.payload;
    if (p?.toolName !== 'publicarPost') continue;
    const r = p.result;
    if (r?.publicado === true || r?.url) return String(r?.externalUrl ?? r?.url ?? '') || SIN_ENLACE;
  }
  return null;
}
