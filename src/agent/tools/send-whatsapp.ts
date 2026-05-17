import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sendViaBridge } from '../../whatsapp/bridge';
import { insertMessage } from '../../whatsapp/repo';
import { remember } from '../../memory/index';

export const sendWhatsappTool = createTool({
  id: 'send-whatsapp',
  description:
    'Send a WhatsApp message to a phone number via the Baileys bridge and log it in the database. Use the user explicit phone (digits only, no +) or JID.',
  inputSchema: z.object({
    to: z.string().min(8).describe('Phone in E.164 digits only (e.g. 5215512345678) or full JID.'),
    message: z.string().min(1).describe('Body text. Plain text, no markdown.'),
  }),
  outputSchema: z.object({
    messageId: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async (input) => {
    const sent = await sendViaBridge(input.to, input.message);
    const row = await insertMessage({
      externalId: sent.id ?? null,
      fromNumber: input.to,
      toNumber: input.to,
      body: input.message,
      direction: 'outbound',
      respondedBy: 'agent',
      messageTimestamp: new Date(),
    });
    await remember({
      refType: 'whatsapp',
      refId: row.id,
      content: input.message,
      metadata: { to: input.to, direction: 'outbound', respondedBy: 'agent' },
    }).catch(() => undefined);
    return { messageId: row.id, externalId: sent.id };
  },
});
