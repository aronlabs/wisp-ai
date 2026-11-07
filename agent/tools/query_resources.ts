import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool('query_resources', defineTool({
  description: 'Reads current money in copper, bag items/free slots and skill/profession ranks. Used to check affordability, materials and profession plans. Collapsed skill headers may hide entries; missing API/data is not zero.',
  inputSchema: z.object({}), label: { start: () => 'Reading resources' },
  execute: async (args, ctx) => agentRPC('inspect', { eveSession: ctx.session.id, inspection: { kind: 'resources', args } }, ctx.abortSignal),
}));
