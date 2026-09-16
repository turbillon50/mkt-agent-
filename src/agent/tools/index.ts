/**
 * Las tools del agente GLOBAL — el que corre sin nadie mirando: el contestador
 * de WhatsApp y el CLI de una sola marca.
 *
 * CORRIDA 6: de aquí se fueron `publish-post` y `send-whatsapp`.
 *
 * No por limpieza. Las dos publicaban y mandaban mensajes con las cuentas de la
 * casa (`src/posters/*`, tokens del entorno), porque este agente no sabe de
 * ningún proyecto y no tiene a quién preguntarle de quién es la cuenta. Con un
 * cliente daba igual; con tres, cualquier camino que llegara a este agente
 * publicaba el contenido de un cliente en la página de otro.
 *
 * Lo que queda aquí solo LEE y REDACTA. Todo lo que actúa hacia fuera vive en
 * `src/agent/project-tools.ts`, donde el proyecto viene cerrado en la tool y la
 * identidad de canal es siempre `composioUserId(projectId)`.
 */
export { generatePostTool } from './generate-post';
export { recallTool } from './recall';
export { saveKnowledgeTool } from './save-knowledge';
export { planWeekTool } from './plan-week';
export { listRecentPostsTool } from './list-recent-posts';
export { updateMyIdentityTool } from './update-my-identity';
export { readUrlTool } from './read-url';
export { webSearchTool } from './web-search';

import { generatePostTool } from './generate-post';
import { recallTool } from './recall';
import { saveKnowledgeTool } from './save-knowledge';
import { planWeekTool } from './plan-week';
import { listRecentPostsTool } from './list-recent-posts';
import { updateMyIdentityTool } from './update-my-identity';
import { readUrlTool } from './read-url';
import { webSearchTool } from './web-search';

export const agentTools = {
  generatePost: generatePostTool,
  recallMemory: recallTool,
  saveKnowledge: saveKnowledgeTool,
  planWeek: planWeekTool,
  listRecentPosts: listRecentPostsTool,
  updateMyIdentity: updateMyIdentityTool,
  readUrl: readUrlTool,
  webSearch: webSearchTool,
};
