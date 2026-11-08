import { defineTool } from 'eve/tools';
import { enabledTool } from '@wisp/agent/enabled-tool';
import { agentRPC } from '@wisp/agent/agent-rpc';
import { simulationInput } from '@wisp/protocol/simulation';
export default enabledTool(
  'simulate_dps',
  defineTool({
    description:
      'Simulate up to 3 damage plans across current equipment and up to 2 candidate equipment sets using ONE fresh bridge-owned Forever snapshot, levels 1–60, fixed scenario and seed. Query wow__query_character for learned spells before designing plans; use exact learned engine-selected rank IDs, never guessed or max-level presets. Ordered opener runs once, then first castable priority wins. Conditions: mana percentages, rageAbove, energyAbove, comboPointsAtLeast (rogue), dotRefreshBelowSeconds (damage-over-time spells only). Defaults: melee classes 5 yards, others 20. Supported families by class: MAGE Frostbolt/Fireball/FireBlast/ArcaneMissiles/FrostNova/ArcaneExplosion; WARRIOR HeroicStrike/Rend/Slam/ThunderClap/Bloodrage (Battle Stance, zero starting rage); ROGUE SinisterStrike/Eviscerate; HUNTER ArcaneShot/MultiShot/SerpentSting/HuntersMark/AspectOfTheHawk/RapidFire (requires learned Auto Shot and ranged weapon); PALADIN SealOfRighteousness/Judgement/HolyStrike/Consecration (cast seal before Judgement); PRIEST Smite/MindBlast/ShadowWordPain; SHAMAN LightningBolt/ChainLightning/EarthShock/FlameShock; WARLOCK ShadowBolt/Incinerate/Immolate/Corruption; DRUID Wrath/Starfire/Moonfire (caster only). Shoot requires a wand and mage/priest/warlock; Orc Blood Fury is explicit. Melee adapters require a main-hand weapon and <=5 yards; Nova/Explosion/Consecration/ThunderClap require <=10. Candidate equipmentSets contain labels and replacements {slot,itemId}; use wow__inspect_reference or wow__compare_items to verify item IDs first. Slots are native WoW inventory slots; itemId 0 explicitly removes a slot. Replacements are unenchanted base catalog items without random suffixes; unchanged slots preserve their live enchants/suffixes. Remove off hand explicitly when proposing a two-handed weapon. No stat, talent or character overrides. Each equipmentDelta compares the same plan to current gear; relativeToFirstPercent compares to first plan/current gear. Report scenario, mean/variation, source, unused actions and class assumptions. No pets, healing, tanking, survival, movement, latency or actual weapon-skill readings. Never claim support for every specialization, actual questing DPS or a globally optimal build. Never auto-run in the background.',
    inputSchema: simulationInput,
    label: { start: () => 'Simulating DPS with WoWSims' },
    execute: (args, ctx) =>
      agentRPC('simulate', { eveSession: ctx.session.id, ...args }, ctx.abortSignal, 85000),
  }),
);
