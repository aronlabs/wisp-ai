import { defineTool } from 'eve/tools';
import { progressionInput } from '../../src/game-inspection.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { enabledTool } from '../../src/enabled-tool.ts';
export default enabledTool(
  'query_progression',
  defineTool({
    description:
      'Reads active quests, completion flags for up to 40 verified quest IDs and reputations for specified faction IDs. Resolve chains and IDs with Everloot first. Not completed does not imply currently available or prerequisite-free.',
    inputSchema: progressionInput,
    label: { start: () => 'Reading progression' },
    execute: async (args, ctx) =>
      agentRPC(
        'inspect',
        { eveSession: ctx.session.id, inspection: { kind: 'progression', args } },
        ctx.abortSignal,
      ),
  }),
);
