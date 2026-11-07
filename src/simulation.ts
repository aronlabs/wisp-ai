import { z } from 'zod';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
const rotationAction = z.strictObject({
  spellId: z.number().int().positive(),
  manaBelowPercent: z.number().min(0).max(100).optional(),
  manaAbovePercent: z.number().min(0).max(100).optional(),
});
const rotationPlan = z.strictObject({
  label: z.string().trim().min(1).max(80),
  opener: z.array(rotationAction).max(8).default([]),
  priority: z.array(rotationAction).min(1).max(12),
});
export const simulationInput = z.strictObject({
  plans: z.array(rotationPlan).min(1).max(3),
  durationSeconds: z.number().int().min(10).max(180).default(30),
  iterations: z.number().int().min(100).max(2000).default(500),
  targetLevelOffset: z.number().int().min(-2).max(3).default(0),
  targetDistanceYards: z.number().min(5).max(30).default(20),
});
const reading = z.object({
  sections: z.object({
    character: z.object({
      status: z.literal('available'),
      data: z.object({
        name: z.string(),
        realm: z.string(),
        game: z.literal('WoW Forever'),
        level: z.number().int().min(1).max(60),
        class: z.literal('MAGE'),
        raceToken: z.string(),
        build: z.string().optional(),
      }),
    }),
    spells: z.object({
      status: z.literal('available'),
      data: z.object({ known: z.array(z.object({ id: z.number().int().positive() })) }),
    }),
    talents: z.object({
      status: z.literal('available'),
      data: z.object({
        selected: z.array(
          z.object({ id: z.number().int().positive(), rank: z.number().int().min(1).max(5) }),
        ),
        hasPendingChanges: z.boolean().optional(),
      }),
    }),
    gear: z.object({
      status: z.literal('available'),
      data: z.object({
        items: z.array(
          z.object({
            slot: z.number().int().min(1).max(19),
            id: z.number().int().positive(),
            link: z.string(),
          }),
        ),
      }),
    }),
  }),
});
interface Manifest {
  wandIds: number[];
  triggerParents: Record<string, number>;
  name: string;
  source: string;
  upstream: string;
  commit: string;
  sha256: string;
  ranks: Record<string, { id: number; level: number }[]>;
}
const raceMap: Record<string, string> = {
  Human: 'RaceHuman',
  Gnome: 'RaceGnome',
  Troll: 'RaceTroll',
  Scourge: 'RaceUndead',
  Undead: 'RaceUndead',
  Dwarf: 'RaceDwarf',
  NightElf: 'RaceNightElf',
  Orc: 'RaceOrc',
  Tauren: 'RaceTauren',
};
const slots = [1, 2, 3, 15, 5, 9, 10, 6, 7, 8, 11, 12, 13, 14, 16, 17, 18];
export class Simulator {
  readonly root: string;
  readonly runtime: string;
  constructor(root: string, runtime = path.join(root, 'runtime')) {
    this.root = path.resolve(root);
    this.runtime = path.resolve(runtime);
  }
  async prepare(snapshot: unknown, input: z.input<typeof simulationInput>) {
    const options = simulationInput.parse(input);
    const parsed = reading.safeParse(snapshot);
    if (!parsed.success) {
      throw Error(
        'Fresh, complete Forever mage character, raceToken, talents, spells and gear readings are required. Reload the addon if needed. Other classes are not supported by this adapter.',
      );
    }
    const s = parsed.data.sections,
      c = s.character.data;
    if (s.talents.data.hasPendingChanges) {
      throw Error('Apply or discard pending talent edits before simulating.');
    }
    const race = raceMap[c.raceToken];
    if (!race) {
      throw Error('The current race has not been validated for this simulator adapter.');
    }
    const directory = path.join(this.root, 'simulator');
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'manifest.json'), 'utf8'),
    ) as Manifest;
    const trees = JSON.parse(await readFile(path.join(directory, 'mage-talents.json'), 'utf8')) as {
      id: number;
      max: number;
    }[][];
    const itemIds = new Set<number>(
      JSON.parse(await readFile(path.join(directory, 'item-ids.json'), 'utf8')),
    );
    const selected = new Map(s.talents.data.selected.map((t) => [t.id, t.rank]));
    const mapped = new Set<number>();
    const talentsString = trees
      .map((tree) =>
        tree
          .map((t) => {
            const rank = selected.get(t.id) ?? 0;
            if (rank > t.max) {
              throw Error('Talent rank exceeds the simulator data.');
            }
            if (rank) {
              mapped.add(t.id);
            }
            return rank;
          })
          .join(''),
      )
      .join('-');
    if (mapped.size !== selected.size) {
      throw Error(
        'Some selected talents are missing from the pinned Forever simulator. No talent was silently omitted.',
      );
    }
    const points = [...selected.values()].reduce((a, b) => a + b, 0);
    if (points > Math.max(0, c.level - 9)) {
      throw Error('Selected talents exceed the current level budget.');
    }
    const known = new Set(s.spells.data.known.map((x) => x.id));
    const plan = options.plans[0];
    const actions = [...plan.opener, ...plan.priority];
    const spellIds = [...new Set(actions.map((a) => a.spellId))];
    for (const id of spellIds) {
      if (!known.has(id)) {
        throw Error('Spell ' + id + ' is not confirmed learned by this character.');
      }
      if (id === 5019) {
        if (!s.gear.data.items.some((i) => i.slot === 18 && manifest.wandIds.includes(i.id))) {
          throw Error('Shoot requires an equipped wand.');
        }
        continue;
      }
      if (id === 20572 && c.raceToken === 'Orc') {
        continue;
      }
      const family = Object.entries(manifest.ranks).find(([, ranks]) =>
        ranks.some((r) => r.id === id),
      );
      if (!family) {
        throw Error('Spell ' + id + ' has not been validated for this adapter.');
      }
      const expected = family[1].filter((r) => r.level <= c.level).at(-1);
      if (expected?.id !== id) {
        throw Error(
          'Spell ' +
            id +
            ' does not match the engine-selected rank at this level. No unlearned rank was substituted.',
        );
      }
      if (
        ['frostNova', 'arcaneExplosion'].includes(family[0]) &&
        options.targetDistanceYards > 10
      ) {
        throw Error('This area spell requires the fixed target to be within 10 yards.');
      }
      if (family[0] === 'fireBlast' && options.targetDistanceYards > 20) {
        throw Error('Fire Blast requires the target within 20 yards.');
      }
    }
    const channels = spellIds.filter((id) =>
      manifest.ranks.arcaneMissiles.some((r) => r.id === id),
    );
    const compileAction = (a: z.infer<typeof rotationAction>, isPriority = false) => {
      const vals: Record<string, unknown>[] = [];
      for (const id of channels) {
        vals.push({ not: { val: { spellIsChanneling: { spellId: { spellId: id } } } } });
      }
      if (isPriority && plan.opener.length) {
        vals.push({ sequenceIsComplete: { sequenceName: 'opening' } });
      }
      if (a.spellId === 5019) {
        vals.push({ gcdIsReady: {} });
        for (const id of spellIds.filter((id) =>
          [...manifest.ranks.frostbolt, ...manifest.ranks.fireball].some((r) => r.id === id),
        )) {
          vals.push({ not: { val: { spellIsCasting: { spellId: { spellId: id } } } } });
        }
      }
      if (a.manaBelowPercent !== undefined) {
        vals.push({
          cmp: {
            op: 'OpLe',
            lhs: { currentManaPercent: {} },
            rhs: { const: { val: a.manaBelowPercent + '%' } },
          },
        });
      }
      if (a.manaAbovePercent !== undefined) {
        vals.push({
          cmp: {
            op: 'OpGe',
            lhs: { currentManaPercent: {} },
            rhs: { const: { val: a.manaAbovePercent + '%' } },
          },
        });
      }
      return {
        ...(vals.length ? { condition: vals.length === 1 ? vals[0] : { and: { vals } } } : {}),
        ...(manifest.ranks.arcaneMissiles.some((r) => r.id === a.spellId)
          ? {
              channelSpell: {
                spellId: { spellId: a.spellId },
                interruptIf: { const: { val: 'false' } },
              },
            }
          : { castSpell: { spellId: { spellId: a.spellId } } }),
      };
    };
    const priorityList: unknown[] = [];
    if (plan.opener.length) {
      priorityList.push({
        action: {
          sequence: { name: 'opening', actions: plan.opener.map((a) => compileAction(a)) },
        },
      });
    }
    priorityList.push(...plan.priority.map((a) => ({ action: compileAction(a, true) })));
    const gear = new Map(s.gear.data.items.map((i) => [i.slot, i]));
    if (gear.size !== s.gear.data.items.length) {
      throw Error('The gear reading contains duplicate slots.');
    }
    const items = slots.map((slot) => {
      const item = gear.get(slot);
      if (!item) {
        return {};
      }
      if (!itemIds.has(item.id)) {
        throw Error('Equipped item ' + item.id + ' is absent from the pinned simulator database.');
      }
      const fields = item.link.match(/item:([^|]+)/)?.[1].split(':');
      if (!fields || Number(fields[0]) !== item.id) {
        throw Error('Equipped item link does not match its ID.');
      }
      return { id: item.id, enchant: Number(fields[1] || 0), randomSuffix: Number(fields[6] || 0) };
    });
    const targetLevel = c.level + options.targetLevelOffset;
    if (targetLevel < 1 || targetLevel > 63) {
      throw Error('Target level is outside the supported range.');
    }
    const request = {
      raid: {
        parties: [
          {
            players: [
              {
                name: c.name,
                race,
                class: 'ClassMage',
                level: c.level,
                equipment: { items },
                talentsString,
                mage: { options: { classOptions: {} } },
                distanceFromTarget: options.targetDistanceYards,
                rotation: {
                  type: 'TypeAPL',
                  priorityList,
                },
              },
            ],
          },
        ],
      },
      encounter: {
        duration: options.durationSeconds,
        targets: [{ level: targetLevel, mobType: 'MobTypeHumanoid' }],
      },
      simOptions: { iterations: options.iterations, randomSeed: 12345 },
    };
    return {
      request,
      manifest,
      character: { name: c.name, realm: c.realm, level: c.level, build: c.build },
      scenario: {
        ...options,
        targetLevel,
        spellIds,
        plan,
        talentPoints: points,
        equippedItems: items.filter((i) => 'id' in i).length,
      },
    };
  }
  async run(snapshot: unknown, input: z.input<typeof simulationInput>, signal?: AbortSignal) {
    const options = simulationInput.safeParse(input);
    if (!options.success) {
      return {
        status: 'unavailable' as const,
        version: 'forever',
        error: 'Invalid simulation plans or scenario. No DPS was calculated.',
      };
    }
    const results: Extract<Awaited<ReturnType<Simulator['runSingle']>>, { status: 'available' }>[] =
      [];
    const budget = AbortSignal.timeout(45000);
    const runSignal = signal ? AbortSignal.any([signal, budget]) : budget;
    for (const plan of options.data.plans) {
      const result = await this.runSingle(snapshot, { ...options.data, plans: [plan] }, runSignal);
      if (result.status !== 'available') {
        return result;
      }
      results.push(result);
    }
    return {
      status: 'available' as const,
      version: 'forever',
      character: results[0].character,
      engine: results[0].engine,
      results: results.map((r, i) => ({
        ...r,
        label: options.data.plans[i].label,
        relativeToFirstPercent: (r.dps.average / results[0].dps.average - 1) * 100,
      })),
      note: 'All plans use the same character snapshot, scenario, iterations and random seed. Differences compare these plans only; they do not prove a globally optimal rotation.',
    };
  }
  private async runSingle(
    snapshot: unknown,
    input: z.input<typeof simulationInput>,
    signal?: AbortSignal,
  ) {
    let temporary: string | undefined;
    try {
      const prepared = await this.prepare(snapshot, input);
      const executable = path.join(this.root, 'simulator', 'wowsimcli.exe');
      const hash = createHash('sha256')
        .update(await readFile(executable))
        .digest('hex');
      if (hash !== prepared.manifest.sha256) {
        throw Error('Simulator binary does not match the pinned manifest.');
      }
      await mkdir(this.runtime, { recursive: true });
      temporary = await mkdtemp(path.join(this.runtime, 'simulation-'));
      const infile = path.join(temporary, 'input.json'),
        outfile = path.join(temporary, 'output.json');
      await writeFile(infile, JSON.stringify(prepared.request));
      await execute(executable, ['sim', '--infile', infile, '--outfile', outfile], {
        windowsHide: true,
        timeout: 45000,
        maxBuffer: 1024 * 1024,
        signal,
      });
      const result = JSON.parse(await readFile(outfile, 'utf8'));
      if (result.error) {
        throw Error(result.error.message || 'Simulator rejected this character.');
      }
      const player = result.raidMetrics?.parties?.[0]?.players?.[0];
      const dps = player?.dps;
      if (
        !Number.isFinite(dps?.avg) ||
        dps.avg <= 0 ||
        result.iterationsDone !== prepared.scenario.iterations
      ) {
        throw Error('Simulator did not finish with a valid positive DPS result.');
      }
      const damageBySpell = (player.actions ?? [])
        .map((a: any) => ({
          spellId: prepared.manifest.triggerParents[a.id?.spellId] ?? a.id?.spellId,
          damagePerFight:
            (a.targets ?? []).reduce((sum: number, t: any) => sum + (t.damage ?? 0), 0) /
            result.iterationsDone,
        }))
        .filter((a: any) => a.damagePerFight > 0);
      if (!damageBySpell.some((a: any) => prepared.scenario.spellIds.includes(a.spellId))) {
        throw Error('The selected learned spell did not deal damage.');
      }
      return {
        status: 'available' as const,
        version: 'forever',
        engine: {
          name: prepared.manifest.name,
          source: prepared.manifest.source,
          upstream: prepared.manifest.upstream,
          commit: prepared.manifest.commit,
        },
        character: prepared.character,
        scenario: prepared.scenario,
        dps: { average: dps.avg, standardDeviation: dps.stdev, min: dps.min, max: dps.max },
        damageBySpell,
        secondsOutOfMana: player.secondsOomAvg,
        unusedSpellIds: prepared.scenario.spellIds.filter(
          (id) => !damageBySpell.some((a: any) => a.spellId === id),
        ),
        assumptions: [
          'Experimental WoWSims Forever levelsim fork; mage adapter only.',
          'Stationary single target, fixed duration and seed. Opening sequence runs once, then actions follow priority, mana conditions, cooldowns and engine cast/channel timing.',
          'Current equipped items and applied talents. The engine automatically applies level-scaled Arcane Intellect as a self-buff; no other external buffs, consumables or temporary enchants. Requested racial cooldowns are explicit actions.',
          'Shoot uses the equipped wand and assumes maximum wand skill for this level; current weapon skill is not read. Zero-damage actions may be utility cooldowns or may never be reached under the selected priorities.',
          'No incoming attacks, movement, kiting or player latency. This is a scenario estimate, not measured combat DPS.',
        ],
      };
    } catch (error) {
      return {
        status: 'unavailable' as const,
        version: 'forever',
        error: error instanceof Error ? error.message : 'Simulation failed',
        note: 'No valid DPS result. Do not invent a number or substitute a level-60 preset.',
      };
    } finally {
      if (temporary && temporary.startsWith(this.runtime + path.sep)) {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
}
