export { generatePostTool } from './generate-post.js';
export { publishPostTool } from './publish-post.js';
export { recallTool } from './recall.js';
export { saveKnowledgeTool } from './save-knowledge.js';
export { planWeekTool } from './plan-week.js';
export { listRecentPostsTool } from './list-recent-posts.js';

import { generatePostTool } from './generate-post.js';
import { publishPostTool } from './publish-post.js';
import { recallTool } from './recall.js';
import { saveKnowledgeTool } from './save-knowledge.js';
import { planWeekTool } from './plan-week.js';
import { listRecentPostsTool } from './list-recent-posts.js';

export const agentTools = {
  generatePost: generatePostTool,
  publishPost: publishPostTool,
  recallMemory: recallTool,
  saveKnowledge: saveKnowledgeTool,
  planWeek: planWeekTool,
  listRecentPosts: listRecentPostsTool,
};
