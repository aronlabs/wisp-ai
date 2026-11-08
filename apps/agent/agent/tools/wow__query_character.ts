import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { enabledTool } from '@wisp/agent/enabled-tool';
export default enabledTool(
  'query_character',
  defineTool({
    description:
      'Requests a FRESH character reading from the addon, never conversation memory. talents returns unspentPoints, spentPoints, totalPoints, selected talents with ranks/branches, and pending changes when available. Request relevant sections together. Unavailable or unknown data does not mean absence or zero.',
    inputSchema: z.object({
      sections: z
        .array(z.enum(['character', 'location', 'talents', 'spells', 'quests', 'gear', 'bags']))
        .min(1)
        .max(7),
    }),
    label: { start: ({ sections }) => 'Reading ' + sections.join(', ') },
    async execute({ sections }, ctx) {
      const res = await fetch('http://127.0.0.1:43187/state', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN,
        },
        body: JSON.stringify({ eveSession: ctx.session.id, sections: sections }),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) {
        throw new Error('Unable to read character: ' + (await res.text()));
      }
      return await res.json();
    },
  }),
);
