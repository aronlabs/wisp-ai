import { defineMcpClientConnection } from 'eve/connections';
import { defineDynamic } from 'eve';
import { capabilityEnabled, connectionTools, everlootTools } from '../../src/capabilities.ts';
export default defineDynamic(async () => {
  if (!(await capabilityEnabled('mcp:everloot'))) {
    return null;
  }
  const allowed = await connectionTools('everloot', everlootTools);
  if (!allowed.length) {
    return null;
  }
  return defineMcpClientConnection({
    url: 'https://everloot.app/mcp/public',
    description:
      'Read-only WoW Forever database: items, NPCs, quests, vendors, relations, nearby world locations, talent trees/share codes, profession recipes, realm market values and auction history. Market data comes from uploaded scans, not a live auction feed. Preserve source, build, dataAsOf and licence attribution; missing coverage is unknown.',
    tools: { allow: allowed },
  });
});
