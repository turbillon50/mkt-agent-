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
// La regla dura vive aparte y sin imports, para poder probarla con tsx sin
// levantar Mastra ni `server-only`. Ver src/agent/verdad.ts.
import { garantizarVerdad, SIN_ENLACE } from './verdad';

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
- Nunca des UNA sola opción de pieza. Siempre son dos o tres y el usuario elige.
- Si te preguntan medidas de una red, usa la herramienta y CITA la fuente con su
  fecha. No las digas de memoria.
- No publiques nada sin que el usuario haya dicho que sí a ese texto.

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

export async function preguntarAlAsistente(input: {
  ctx: AgentContext;
  historia: Turno[];
  mensaje: string;
  imagenDataUrl?: string | null;
  /** El id de usuario de la app, para la memoria conversacional. */
  userId?: string | null;
}): Promise<RespuestaAsistente> {
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
  const { nivelComoTexto } = await import('../autonomia/niveles');

  const instrucciones = [
    buildOperatorManifesto(marca, ctx.project.manifesto ?? null),
    reglasDelProyecto(ctx),
    `## Hasta dónde puedes llegar solo\n\n${nivelComoTexto(ctx.project)}`,
    estado ? `## Cómo está el proyecto hoy\n\n${guiaComoTexto(estado)}` : null,
    lecciones.length ? `## Lo que ya te corrigieron aquí\n\n${leccionesComoTexto(lecciones)}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  // El Mesh no ve imágenes. Si el usuario adjuntó una, ESE turno lo contesta
  // Gemini. Se pierde el tool-calling en ese mensaje y solo en ese — es el
  // mismo trato de la corrida 4 y sigue siendo el correcto: ver la foto importa
  // más que poder ejecutar una herramienta en ese mensaje puntual.
  if (input.imagenDataUrl) {
    const texto = await askGeminiVision(
      instrucciones,
      input.historia,
      input.mensaje,
      input.imagenDataUrl,
    );
    return { texto, piezas: [], publicado: null };
  }

  const agente = new Agent({
    id: `goossip-${ctx.project.id.slice(0, 8)}`,
    name: 'goossip',
    instructions: instrucciones,
    model: buildModel(),
    tools: toolsParaProyecto(ctx),
    ...(memory ? { memory } : {}),
  } as never);

  const mensajes = [
    ...input.historia.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: input.mensaje },
  ];

  const opciones: Record<string, unknown> = { ...MODEL_SETTINGS };
  // La memoria conversacional se separa por (usuario, proyecto): el hilo con
  // el cliente A no puede aparecer contestando dentro del cliente B.
  if (memory && input.userId) {
    opciones.memory = memoryIdsFor(`${input.userId}:${ctx.project.id}`);
  }

  const resultado = await agente.generate(mensajes as never, opciones as never);

  const publicado = extraerPublicado(resultado);
  return {
    // La instrucción de arriba pide la verdad; esto la GARANTIZA. Un system
    // prompt es una petición, y la QA ya midió al modelo ignorándola.
    texto: garantizarVerdad(extraerTexto(resultado), publicado),
    piezas: extraerPiezas(resultado),
    publicado,
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

