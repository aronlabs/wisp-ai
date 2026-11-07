import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { enabledTool } from '../../src/enabled-tool.ts';
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
    async execute({ title }, ctx) {
      const res = await fetch('http://127.0.0.1:43187/title', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN,
        },
        body: JSON.stringify({ eveSession: ctx.session.id, title }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        throw new Error('Unable to update conversation title: ' + (await res.text()));
      }
      return await res.json();
    },
  }),
);
