import { agentRPC } from '@wisp/agent/agent-rpc';
import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { enabledTool } from '@wisp/agent/enabled-tool';
export default enabledTool(
  'set_conversation_title',
  defineTool({
    description:
      'Assigns a descriptive conversation title when conversation_context.needsTitle=true, or renames it on an explicit user request. Summarize the topic in the user’s language rather than copying their message.',
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
