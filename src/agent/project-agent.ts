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
import { avisoDeImagen, detectarPedidoDeImagen, type PedidoDeImagen } from '../assistant/intencion';

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
- Cuando escribas un post, OFRECE la pieza. Siempre. Un post sin imagen rinde la
  mitad y el usuario no tiene por qué saber que se la puedes hacer.
- Nunca des UNA sola opción de pieza. Siempre son dos o tres y el usuario elige.
- Si te preguntan medidas de una red, usa la herramienta y CITA la fuente con su
  fecha. No las digas de memoria.
- No publiques nada sin que el usuario haya dicho que sí a ese texto.`;
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

  const estado = await pendientesDelProyecto({
    orgId: ctx.orgId,
    project: ctx.project,
    kit: ctx.kit,
  }).catch(() => null);

  const instrucciones = [
    buildOperatorManifesto(marca, ctx.project.manifesto ?? null),
    reglasDelProyecto(ctx),
    estado ? `## Cómo está el proyecto hoy\n\n${guiaComoTexto(estado)}` : null,
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

  // "Hazme una imagen de…" en lenguaje normal. Si lo pidió, se le avisa al
  // modelo dentro del turno para que llame a `hacer-pieza` a la primera y no
  // conteste con un párrafo describiendo la imagen que haría.
  const pedido = detectarPedidoDeImagen(input.mensaje);

  const mensajes = [
    ...input.historia.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user' as const,
      content: pedido ? `${input.mensaje}\n\n[${avisoDeImagen(pedido)}]` : input.mensaje,
    },
  ];

  const opciones: Record<string, unknown> = { ...MODEL_SETTINGS };
  // La memoria conversacional se separa por (usuario, proyecto): el hilo con
  // el cliente A no puede aparecer contestando dentro del cliente B.
  if (memory && input.userId) {
    opciones.memory = memoryIdsFor(`${input.userId}:${ctx.project.id}`);
  }

  const resultado = await agente.generate(mensajes as never, opciones as never);
  let piezas = extraerPiezas(resultado);
  let texto = extraerTexto(resultado);

  /**
   * La red.
   *
   * Si el usuario pidió una imagen y el turno acabó sin una sola, se hace
   * igual. Es la garantía que traía el arreglo del chat global: quien pide una
   * imagen recibe una imagen, aunque al modelo se le olvide llamar a la
   * herramienta. Lo que cambia respecto de aquel es que ahora sale por el motor
   * del PROYECTO —con su kit, su lienzo y tres opciones— en vez de por una
   * llamada suelta a Gemini.
   */
  if (pedido && piezas.length === 0 && ctx.puedeOperar) {
    const deRespaldo = await piezaDeRespaldo(ctx, pedido).catch(() => null);
    if (deRespaldo && deRespaldo.piezas.length > 0) {
      piezas = deRespaldo.piezas;
      texto = texto?.trim()
        ? `${texto}\n\n${deRespaldo.nota}`
        : deRespaldo.nota;
    }
  }

  return { texto, piezas, publicado: extraerPublicado(resultado) };
}

/** Hace la pieza por el camino normal cuando el modelo no llamó a la tool. */
async function piezaDeRespaldo(
  ctx: AgentContext,
  pedido: PedidoDeImagen,
): Promise<{ piezas: RespuestaAsistente['piezas']; nota: string }> {
  const { esRed } = await import('../creative/specs');
  const { generarPiezas } = await import('../creative/engine');
  const { guardarLote } = await import('../creative/repo');

  // Sin red dicha, Instagram: es la que más piezas pide y su lienzo (4:5) se
  // reencuadra a las demás mejor que al revés.
  const red = esRed(pedido.red) ? pedido.red : 'instagram';

  const resultado = await generarPiezas({
    project: ctx.project,
    kit: ctx.kit,
    red,
    formatoPista: pedido.formato,
    brief: pedido.brief,
  });
  const filas = await guardarLote({
    project: ctx.project,
    kit: ctx.kit,
    red,
    brief: pedido.brief,
    resultado,
  });

  return {
    piezas: filas.map((f) => ({
      id: f.id,
      url: f.url ?? '',
      angulo: String((f.metadata as any)?.angulo ?? 'opción'),
    })),
    nota: `Te dejé ${filas.length} opciones en ${resultado.formato.label} (${resultado.formato.ancho} × ${resultado.formato.alto} px). Dime cuál te gusta y la guardo como la buena.`,
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

function extraerPublicado(resultado: unknown): string | null {
  for (const c of llamadas(resultado).slice().reverse()) {
    const p = c?.payload;
    if (p?.toolName === 'publicarPost' && p.result?.url) return String(p.result.url);
  }
  return null;
}
