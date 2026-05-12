import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { buildPlan } from '../../planner.js';

export const planWeekTool = createTool({
  id: 'plan-week',
  description:
    'Generate a fresh 7-day content plan for every enabled platform and persist it to plan_items. Returns the plan id and count.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    planId: z.string(),
    itemCount: z.number(),
  }),
  execute: async () => {
    const result = await buildPlan();
    return { planId: result.planId, itemCount: result.items.length };
  },
});
