import { defineMcpClientConnection } from 'eve/connections';
import { defineDynamic } from 'eve';
import { capabilityEnabled, connectionTools } from '@wisp/agent/capabilities';
import { everlootTools } from '@wisp/protocol/capabilities';
export default defineDynamic(async () => {
  if (!(await capabilityEnabled('mcp:everloot'))) {
    return null;
  }
  const allowed = await connectionTools('everloot', everlootTools);
  if (!allowed.length) {
    return null;
  }
  const connections: Record<string, ReturnType<typeof defineMcpClientConnection>> = {};
  const referenceTools = allowed.filter(
    (name) => !['search_knowledge', 'recent_changes'].includes(name),
  );
  if (referenceTools.length) {
    connections.everloot = defineMcpClientConnection({
      url: 'https://everloot.app/mcp/public',
      description:
        'Complementary Forever-only observations and reference pages: drops, vendors, quest relations, world locations, talents, professions and realm scan history. Use TheWoWDB for the primary catalog. Missing coverage is unknown. Preserve build, date, source and licence; prices are scans, not live listings.',
      tools: { allow: referenceTools },
    });
  }
  if (allowed.includes('search_knowledge')) {
    connections['everloot-search'] = defineMcpClientConnection({
      url: 'https://everloot.app/mcp/public',
      description:
        'Complementary Everloot search with version fixed to Forever by the application. Cannot search Retail, Classic or archived wiki lore. Use TheWoWDB first for catalog facts.',
      tools: { allow: ['search_knowledge'] },
      toolCall: { providedArguments: { version: 'forever' } },
    });
  }
  if (allowed.includes('recent_changes')) {
    connections['everloot-changes'] = defineMcpClientConnection({
      url: 'https://everloot.app/mcp/public',
      description:
        'Official Forever changes only: blue posts, hotfixes and builds. The game filter is supplied by Wisp; Classic changes cannot be selected.',
      tools: { allow: ['recent_changes'] },
      toolCall: { providedArguments: { game: 'forever' } },
    });
  }
  return connections;
});
