import { defineTool } from 'eve/tools';
import { enabledTool } from '../../src/enabled-tool.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { npcLocationsInput } from '../../src/game-inspection.ts';
export default enabledTool(
  'find_npc_locations',
  defineTool({
    description:
      'Find NPC coordinates using the installed QuestieDB Forever public read API. For a class trainer use mode=class_trainers and class=MAGE/etc; this resolves trainer names and spawn pins directly, without web name discovery. For another NPC provide an exact localized name or a verified NPC ID. Supply a native UI map ID from inspect_map for a requested city; omitted mapId uses the current map. Only the Forever provider is accepted. Returned locations have native-map percentage coordinates and ready-to-use map references. Cite QuestieDB Forever and call them database spawn positions, not live sightings. Missing provider/data or an ambiguous coordinate frame is unknown. Do not invent coordinates or use another game version. No map marker is placed; use set_map_waypoint only when requested.',
    inputSchema: npcLocationsInput,
    label: { start: () => 'Finding NPC locations' },
    execute: (args, ctx) =>
      agentRPC(
        'inspect',
        { eveSession: ctx.session.id, inspection: { kind: 'npc_locations', args } },
        ctx.abortSignal,
      ),
  }),
);
