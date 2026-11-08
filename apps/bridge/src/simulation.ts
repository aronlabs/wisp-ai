import { z } from 'zod';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
import { simulationInput, rotationAction } from '@wisp/protocol/simulation';
import { adapters } from './simulation/adapters/index.ts';
import type { ClassMetadata } from './simulation/adapters/types.ts';
import { equipmentSlots, replaceEquipment, type CatalogItem } from './simulation/equipment.ts';
const reading = z.object({
  sections: z.object({
    character: z.object({
      status: z.literal('available'),
      data: z.object({
        name: z.string(),
        realm: z.string(),
        game: z.literal('WoW Forever'),
        level: z.number().int().min(1).max(60),
        class: z.string(),
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
  name: string;
  source: string;
  upstream: string;
  commit: string;
  sha256: string;
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
export class Simulator {
  readonly root: string;
  readonly runtime: string;
  constructor(root: string, runtime = path.join(root, 'runtime')) {
    this.root = path.resolve(root);
    this.runtime = path.resolve(runtime);
  }
  async prepare(
    snapshot: unknown,
    input: z.input<typeof simulationInput>,
    replacements: { slot: number; itemId: number }[] = [],
  ) {
    const parsedOptions = simulationInput.parse(input);
    const parsed = reading.safeParse(snapshot);
    if (!parsed.success) {
      throw Error(
        'Fresh, complete Forever character, raceToken, talents, spells and gear readings are required. Reload the addon if needed.',
      );
    }
    const s = parsed.data.sections,
      c = s.character.data;
    const adapter = adapters[c.class];
    if (!adapter) {
      throw Error('No validated damage adapter for class ' + c.class + '.');
    }
    const options = {
      ...parsedOptions,
      targetDistanceYards: parsedOptions.targetDistanceYards ?? (adapter.melee ? 5 : 20),
    };
    if (adapter.melee && options.targetDistanceYards > 5) {
      throw Error('This melee adapter requires a target within 5 yards.');
    }
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
    const metadata = (
      JSON.parse(await readFile(path.join(directory, 'classes.json'), 'utf8')) as Record<
        string,
        ClassMetadata
      >
    )[c.class];
    if (!metadata) {
      throw Error('Missing pinned metadata for class ' + c.class + '.');
    }
    const trees = metadata.talents;
    const catalog = new Map(
      (JSON.parse(await readFile(path.join(directory, 'items.json'), 'utf8')) as CatalogItem[]).map(
        (i) => [i.id, i],
      ),
    );
    const equipped = replaceEquipment(
      s.gear.data.items,
      replacements,
      catalog,
      c.class,
      c.level,
      c.raceToken,
    );
    const selected = new Map(s.talents.data.selected.map((t) => [t.id, t.rank]));
    if (selected.size !== s.talents.data.selected.length) {
      throw Error('The talent reading contains duplicate talents.');
    }
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
        if (
          !adapter.wand ||
          !equipped.some((i) => i.slot === 18 && manifest.wandIds.includes(i.id))
        ) {
          throw Error('Shoot requires an equipped wand.');
        }
        continue;
      }
      if (id === 20572 && c.raceToken === 'Orc') {
        continue;
      }
      const family = Object.entries(metadata.ranks).find(([, ranks]) =>
        ranks.some((r) => r.id === id),
      );
      if (!family) {
        throw Error('Spell ' + id + ' has not been validated for this adapter.');
      }
      const requiredTalent = adapter.requiredTalents?.[family[0]];
      if (requiredTalent && !selected.has(requiredTalent)) {
        throw Error(
          'Spell ' + id + ' requires an applied talent that is missing from this snapshot.',
        );
      }
      const expected = family[1].filter((r) => r.level <= c.level).at(-1);
      if (expected?.id !== id) {
        throw Error(
          'Spell ' +
            id +
            ' does not match the engine-selected rank at this level. No unlearned rank was substituted.',
        );
      }
      const areaRange = adapter.areaRanges?.[family[0]];
      if (areaRange && options.targetDistanceYards > areaRange) {
        throw Error('This area spell requires the fixed target within ' + areaRange + ' yards.');
      }
      const rank = family[1].find((r) => r.id === id)!;
      if (
        (rank.maxRange > 0 && options.targetDistanceYards > rank.maxRange) ||
        options.targetDistanceYards < rank.minRange
      ) {
        throw Error('Target distance is outside the validated range for spell ' + id + '.');
      }
    }
    if (adapter.melee && !equipped.some((i) => i.slot === 16)) {
      throw Error('This melee adapter requires an equipped main-hand weapon.');
    }
    if (
      adapter.requiresRangedAuto &&
      (!known.has(75) ||
        !equipped.some(
          (i) => i.slot === 18 && [1, 2, 3].includes(catalog.get(i.id)?.rangedWeaponType ?? 0),
        ))
    ) {
      throw Error('Hunter damage requires learned Auto Shot and an equipped bow, gun or crossbow.');
    }
    const channels = spellIds.filter((id) =>
      (adapter.channels ?? []).some((family) => metadata.ranks[family].some((r) => r.id === id)),
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
          Object.values(metadata.ranks)
            .flat()
            .some((r) => r.id === id),
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
      if (
        (a.manaBelowPercent !== undefined || a.manaAbovePercent !== undefined) &&
        adapter.resource !== 'mana'
      ) {
        throw Error('Mana conditions require a mana class.');
      }
      for (const [threshold, resource, expected] of [
        [a.rageAbove, 'currentRage', 'rage'],
        [a.energyAbove, 'currentEnergy', 'energy'],
        [a.comboPointsAtLeast, 'currentComboPoints', 'energy'],
      ] as const) {
        if (threshold === undefined) {
          continue;
        }
        if (adapter.resource !== expected) {
          throw Error('Resource condition is not supported for this class.');
        }
        vals.push({
          cmp: { op: 'OpGe', lhs: { [resource]: {} }, rhs: { const: { val: String(threshold) } } },
        });
      }
      if (a.dotRefreshBelowSeconds !== undefined) {
        if (!(adapter.dots ?? []).some((f) => metadata.ranks[f]?.some((r) => r.id === a.spellId))) {
          throw Error('DoT refresh conditions require a supported damage-over-time spell.');
        }
        vals.push({
          cmp: {
            op: 'OpLe',
            lhs: { dotRemainingTime: { spellId: { spellId: a.spellId } } },
            rhs: { const: { val: a.dotRefreshBelowSeconds + 's' } },
          },
        });
      }
      return {
        ...(vals.length ? { condition: vals.length === 1 ? vals[0] : { and: { vals } } } : {}),
        ...(channels.includes(a.spellId)
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
    const gear = new Map(equipped.map((i) => [i.slot, i]));
    const items = equipmentSlots.map((slot) => {
      const item = gear.get(slot);
      if (!item) {
        return {};
      }
      if (!catalog.has(item.id)) {
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
                class: adapter.engineClass,
                level: c.level,
                equipment: { items },
                talentsString,
                [adapter.spec]: { options: { classOptions: adapter.options ?? {} } },
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
      metadata,
      adapter,
      character: { name: c.name, realm: c.realm, class: c.class, level: c.level, build: c.build },
      scenario: {
        ...options,
        targetLevel,
        spellIds,
        plan,
        talentPoints: points,
        equippedItems: items.filter((i) => 'id' in i).length,
        equipment: equipped.map((i) => ({ slot: i.slot, id: i.id })),
        replacements,
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
    const sets = [
      { label: 'Current equipment', replacements: [] as { slot: number; itemId: number }[] },
      ...options.data.equipmentSets,
    ];
    for (const set of sets) {
      for (const plan of options.data.plans) {
        const result = await this.runSingle(
          snapshot,
          { ...options.data, plans: [plan] },
          runSignal,
          set.replacements,
        );
        if (result.status !== 'available') {
          return result;
        }
        results.push(result);
      }
    }
    return {
      status: 'available' as const,
      version: 'forever',
      character: results[0].character,
      engine: results[0].engine,
      coverage: {
        class: results[0].character.class,
        families: adapters[results[0].character.class].families,
        roles: ['damage'],
        pets: false,
      },
      results: results.map((r, i) => {
        const planIndex = i % options.data.plans.length;
        const setIndex = Math.floor(i / options.data.plans.length);
        const baseline = results[planIndex];
        return {
          ...r,
          label: options.data.plans[planIndex].label,
          equipmentLabel: sets[setIndex].label,
          planIndex,
          equipmentSetIndex: setIndex,
          relativeToFirstPercent: (r.dps.average / results[0].dps.average - 1) * 100,
          equipmentDeltaDps: r.dps.average - baseline.dps.average,
          equipmentDeltaPercent: (r.dps.average / baseline.dps.average - 1) * 100,
        };
      }),
      note: 'All results use one character snapshot, duration, target, iterations and seed. Equipment deltas compare the SAME plan against current equipment; relativeToFirstPercent compares to the first plan with current equipment. Small differences require attention to sampling variation. Replacements are unenchanted base catalog items, with no random suffix. These comparisons do not prove a globally optimal rotation or build.',
    };
  }
  private async runSingle(
    snapshot: unknown,
    input: z.input<typeof simulationInput>,
    signal?: AbortSignal,
    replacements: { slot: number; itemId: number }[] = [],
  ) {
    let temporary: string | undefined;
    try {
      const prepared = await this.prepare(snapshot, input, replacements);
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
      const damage = new Map<
        string,
        { spellId?: number; otherId?: string | number; damagePerFight: number }
      >();
      const casts = new Map<number, number>();
      for (const action of player.actions ?? []) {
        const rawSpellId = action.id?.spellId;
        const spellId = prepared.metadata.triggerParents[rawSpellId] ?? rawSpellId;
        const otherId = action.id?.otherId;
        const key = spellId ? 'spell:' + spellId : 'other:' + otherId;
        const damagePerFight =
          (action.targets ?? []).reduce((sum: number, t: any) => sum + (t.damage ?? 0), 0) /
          result.iterationsDone;
        const castCount =
          (action.targets ?? []).reduce((sum: number, t: any) => sum + (t.casts ?? 0), 0) /
          result.iterationsDone;
        if (rawSpellId && prepared.scenario.spellIds.includes(rawSpellId)) {
          casts.set(rawSpellId, (casts.get(rawSpellId) ?? 0) + castCount);
        }
        if (damagePerFight > 0) {
          damage.set(key, {
            spellId,
            otherId,
            damagePerFight: (damage.get(key)?.damagePerFight ?? 0) + damagePerFight,
          });
        }
      }
      const damageBySpell = [...damage.values()];
      if (
        !prepared.scenario.spellIds.some(
          (id) => (casts.get(id) ?? 0) > 0 || damageBySpell.some((a) => a.spellId === id),
        )
      ) {
        throw Error('None of the selected learned actions executed.');
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
        dps: {
          average: dps.avg,
          standardDeviation: dps.stdev,
          standardError: dps.stdev / Math.sqrt(result.iterationsDone),
          min: dps.min,
          max: dps.max,
        },
        damageBySpell,
        castsBySpell: [...casts].map(([spellId, castsPerFight]) => ({ spellId, castsPerFight })),
        secondsOutOfMana: player.secondsOomAvg,
        unusedSpellIds: prepared.scenario.spellIds.filter(
          (id) => !(casts.get(id) || damageBySpell.some((a) => a.spellId === id)),
        ),
        zeroDamageSpellIds: prepared.scenario.spellIds.filter(
          (id) => !damageBySpell.some((a) => a.spellId === id),
        ),
        assumptions: [
          'Experimental WoWSims Forever levelsim fork; ' +
            prepared.adapter.token +
            ' damage adapter.',
          'Stationary single target, fixed duration and seed. Opening sequence runs once, then actions follow priority, mana conditions, cooldowns and engine cast/channel timing.',
          'Applied talents and current equipment, except explicit catalog replacements. No external buffs, consumables or temporary enchants. Orc Blood Fury requires an explicit action.',
          'The engine assumes trained weapon types and level-appropriate weapon skills; current weapon training/skill is not read. Zero-damage actions may be utility cooldowns or may never be reached under the selected priorities.',
          'No incoming attacks, movement, kiting or player latency. This is a scenario estimate, not measured combat DPS.',
          ...prepared.adapter.assumptions,
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
