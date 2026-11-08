import { agentRPC } from '@wisp/agent/agent-rpc';
import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { enabledTool } from '@wisp/agent/enabled-tool';
export default enabledTool(
  'set_conversation_title',
  defineTool({
    description:
      "Sets a short, descriptive conversation title in the user's language. Call once when conversation_context.needsTitle is true. This updates sidebar metadata, not the chat reply.",
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .max(60)
        .describe(
          'A natural title of 3–6 words about the topic; no quotes, markup, generic greeting or character-state dump.',
        ),
    }),
    label: { start: () => 'Naming conversation' },
    execute: ({ title }, ctx) =>
      agentRPC('title', { eveSession: ctx.session.id, title }, ctx.abortSignal, 5000),
  }),
);
