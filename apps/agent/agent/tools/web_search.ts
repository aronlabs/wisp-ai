import { defineTool } from 'eve/tools';
import { enabledTool } from '@wisp/agent/enabled-tool';
import { agentRPC } from '@wisp/agent/agent-rpc';
import { wowheadQuery } from '@wisp/protocol/search';

export default enabledTool(
  'web_search',
  defineTool({
    description:
      'Fallback web search restricted to Wowhead Forever. Use when TheWoWDB and Everloot lack relevant reference data or for Forever guides. The bridge enforces the site-scoped query and rejects summaries citing other versions. No arbitrary site or version argument is accepted. Cite the returned sources; unavailable is not absence.',
    inputSchema: wowheadQuery,
    label: { start: () => 'Searching Wowhead Forever' },
    execute: (args, ctx) =>
      agentRPC('wowhead', { eveSession: ctx.session.id, ...args }, ctx.abortSignal, 65000),
  }),
);
