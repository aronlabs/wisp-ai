import { defineTool } from 'eve/tools';
import { referenceInput } from '../../src/game-inspection.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool('inspect_reference', defineTool({
  description: 'Reads an item, spell, talent (spell ID) or quest from the live game API, including available tooltip text and requirements. Use verified IDs only. Uncached data can be unavailable; retry after loading or use the Everloot database for sources and relations.',
  inputSchema: referenceInput, label: { start: ({ kind }) => 'Inspecting ' + kind },
  execute: async (args, ctx) => agentRPC('inspect', { eveSession: ctx.session.id, inspection: { kind: 'reference', args } }, ctx.abortSignal),
}));
