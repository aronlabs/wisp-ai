import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { searchToolGroups } from '@wisp/agent/model-tools';

export default defineTool({
  description:
    'Find and load specialized WoW tools by task or tool name (English or Spanish). Returns matching groups; their available schemas appear on the next step. Disabled tools remain unavailable. Use query_character directly for ordinary character/quest-log readings.',
  inputSchema: z.object({ query: z.string().min(2).max(200) }),
  label: { start: () => 'Finding capabilities' },
  execute: async ({ query }) => searchToolGroups(query),
});
