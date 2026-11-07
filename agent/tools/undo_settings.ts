import { defineTool } from 'eve/tools';
import { enabledTool } from '../../src/enabled-tool.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { settingsUndo } from '../../src/settings.ts';
export default enabledTool(
  'undo_settings',
  defineTool({
    description:
      'Undo a previously applied settings transaction for the same character. Checks that the current values still equal Wisp’s changes; never overwrites subsequent player changes. No code editing.',
    inputSchema: settingsUndo,
    label: { start: () => 'Restoring settings' },
    execute: (args, ctx) =>
      agentRPC(
        'action',
        { eveSession: ctx.session.id, action: { kind: 'undo_settings', args } },
        ctx.abortSignal,
      ),
  }),
);
