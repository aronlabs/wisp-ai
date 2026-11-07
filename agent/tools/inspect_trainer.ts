import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool(
  'inspect_trainer',
  defineTool({
    description:
      'Reads offers, learning status, costs and requirements from the trainer window currently open in WoW. Filters may hide offers. The user must talk to a trainer first. Does not train or spend money.',
    inputSchema: z.object({}),
    label: { start: () => 'Inspecting trainer' },
    execute: async (args, ctx) =>
      agentRPC(
        'inspect',
        { eveSession: ctx.session.id, inspection: { kind: 'trainer', args } },
        ctx.abortSignal,
      ),
  }),
);
