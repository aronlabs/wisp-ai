import { defineTool } from 'eve/tools';
import { enabledTool } from '../../src/enabled-tool.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { settingsUpdate } from '../../src/settings.ts';
export default enabledTool('update_settings', defineTool({
  description: 'Preview a bounded settings proposal using exact IDs and typed values obtained from get_settings. Returns before/after values and a transactionId; nothing is applied during preview. Apply an existing transaction only when requested by the user. The UI can offer an Apply button. Changes are checked for stale values, applied through APIs/setters and verified; failed changes attempt rollback. Never edits addon source code. No execute/reset/delete/profile operations.',
  inputSchema: settingsUpdate, label: { start: () => 'Updating settings' },
  execute: (args, ctx) => agentRPC('action', { eveSession: ctx.session.id, action: { kind: 'update_settings', args } }, ctx.abortSignal),
}));
