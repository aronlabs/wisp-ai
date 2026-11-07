import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool('inspect_target', defineTool({
  description: 'Reads the currently selected target: name, NPC ID when available, level, classification, faction and hostility. Does not infer drops, quest involvement, target coordinates or fight difficulty from level alone.',
  inputSchema: z.object({}), label: { start: () => 'Inspecting target' },
  execute: async (args, ctx) => agentRPC('inspect', { eveSession: ctx.session.id, inspection: { kind: 'target', args } }, ctx.abortSignal),
}));
