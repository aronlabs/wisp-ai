import { defineTool } from 'eve/tools';
import { enabledTool } from '../../src/enabled-tool.ts';
import { agentRPC } from '../../src/agent-rpc.ts';
import { simulationInput } from '../../src/simulation.ts';
export default enabledTool(
  'simulate_dps',
  defineTool({
    description:
      'Simulate or compare up to 3 mage rotations with ONE fresh server-owned Forever character snapshot, level 1–60, fixed scenario and seed. Use query_character to discover learned spells before designing plans. Each plan has a once-only ordered opener and a repeating priority list (first castable action wins), with optional mana percentage conditions. Engine handles cooldown readiness, cast/channel time and wand shots. Supported families: Frostbolt, Fireball, Fire Blast, Arcane Missiles, Frost Nova, Arcane Explosion, Shoot (equipped wand required), Orc Blood Fury. Use exact learned rank IDs, no guessed or level-60 spells. Frost Nova/Arcane Explosion require targetDistanceYards <=10. Results are experimental stationary scenarios, not an optimized maximum or actual questing DPS; report assumptions, unused actions and the variation. No state overrides, code or arbitrary APL input. Never call automatically in the background.',
    inputSchema: simulationInput,
    label: { start: () => 'Simulating DPS with WoWSims' },
    execute: (args, ctx) =>
      agentRPC('simulate', { eveSession: ctx.session.id, ...args }, ctx.abortSignal, 85000),
  }),
);
