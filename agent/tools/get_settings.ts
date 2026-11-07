import { defineTool } from 'eve/tools';
import { enabledTool } from '../../src/enabled-tool.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { settingsRead } from '../../src/settings.ts';
export default enabledTool(
  'get_settings',
  defineTool({
    description:
      'Discovers and reads live game CVars, registered AceConfig addon options, installed addons, keybindings and action bar contents. Use sections, addon, query or exact opaque IDs with pagination. Only registered/loaded options are discoverable. Missing settings require a Wisp integration, never source edits or guessing global variables. Bars and bindings are read-only.',
    inputSchema: settingsRead,
    label: { start: () => 'Reading settings' },
    execute: (args, ctx) =>
      agentRPC(
        'inspect',
        { eveSession: ctx.session.id, inspection: { kind: 'settings', args } },
        ctx.abortSignal,
      ),
  }),
);
