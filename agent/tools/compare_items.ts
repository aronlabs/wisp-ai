import { defineTool } from 'eve/tools';
import { compareInput } from '../../src/game-inspection.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool(
  'compare_items',
  defineTool({
    description:
      'Reads candidate items and currently equipped items with raw stat differences for matching equipment slots. Specify slot to compare a particular slot. No simulated DPS or stat weights. Two-handed/dual-wield and set effects require separate reasoning; unavailable stats are unknown.',
    inputSchema: compareInput,
    label: { start: () => 'Comparing equipment' },
    execute: async (args, ctx) =>
      agentRPC(
        'inspect',
        { eveSession: ctx.session.id, inspection: { kind: 'compare_items', args } },
        ctx.abortSignal,
      ),
  }),
);
