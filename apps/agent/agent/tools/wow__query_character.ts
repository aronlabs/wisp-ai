import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { characterSections } from '@wisp/protocol/agent-rpc';
import { agentRPC } from '@wisp/agent/agent-rpc';
import { enabledTool } from '@wisp/agent/enabled-tool';
export default enabledTool(
  'query_character',
  defineTool({
    description:
      'Requests a FRESH character reading from the addon, never conversation memory. talents returns unspentPoints, spentPoints, totalPoints, selected talents with ranks/branches, and pending changes when available. Request relevant sections together. Unavailable or unknown data does not mean absence or zero.',
    inputSchema: z.object({
      sections: characterSections,
    }),
    label: { start: ({ sections }) => 'Reading ' + sections.join(', ') },
    execute: ({ sections }, ctx) =>
      agentRPC('state', { eveSession: ctx.session.id, sections }, ctx.abortSignal),
  }),
);
