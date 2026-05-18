export { generatePostTool } from './generate-post';
export { publishPostTool } from './publish-post';
export { recallTool } from './recall';
export { saveKnowledgeTool } from './save-knowledge';
export { planWeekTool } from './plan-week';
export { listRecentPostsTool } from './list-recent-posts';
export { sendWhatsappTool } from './send-whatsapp';
export { updateMyIdentityTool } from './update-my-identity';

import { generatePostTool } from './generate-post';
import { publishPostTool } from './publish-post';
import { recallTool } from './recall';
import { saveKnowledgeTool } from './save-knowledge';
import { planWeekTool } from './plan-week';
import { listRecentPostsTool } from './list-recent-posts';
import { sendWhatsappTool } from './send-whatsapp';
import { updateMyIdentityTool } from './update-my-identity';

export const agentTools = {
  generatePost: generatePostTool,
  publishPost: publishPostTool,
  recallMemory: recallTool,
  saveKnowledge: saveKnowledgeTool,
  planWeek: planWeekTool,
  listRecentPosts: listRecentPostsTool,
  sendWhatsapp: sendWhatsappTool,
  updateMyIdentity: updateMyIdentityTool,
};
