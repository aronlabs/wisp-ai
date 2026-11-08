import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Simulator } from '@wisp/bridge/simulation';
import { simulationInput } from '@wisp/protocol/simulation';
import type { ClassMetadata } from '../apps/bridge/src/simulation/adapters/types.ts';
import { adapters } from '../apps/bridge/src/simulation/adapters/index.ts';
const simulator = new Simulator(process.cwd());
const input = { plans: [{ label: 'Frostbolt', priority: [{ spellId: 205 }] }] };
export function mageSnapshot(level = 11) {
  return {
    sections: {
      character: {
        status: 'available',
        data: {
          name: 'Test Mage',
          realm: 'Test Realm',
          class: 'MAGE',
          raceToken: 'Human',
          game: 'WoW Forever',
          level,
        },
      },
      spells: {
        status: 'available',
        data: { known: [{ id: 116 }, { id: 205 }, { id: 133 }, { id: 143 }] },
      },
      talents: {
        status: 'available',
        data: { selected: [{ id: 11070, rank: 2 }], hasPendingChanges: false },
      },
      gear: {
        status: 'available',
        data: { items: [] as { slot: number; id: number; link: string }[] },
      },
    },
  };
}
test('level 11 preparation uses exact live state, learned rank and no max-level defaults', async () => {
  const prepared = await simulator.prepare(mageSnapshot(), input);
  const p = prepared.request.raid.parties[0].players[0];
  assert.equal(p.level, 11);
  assert.equal(prepared.scenario.targetLevel, 11);
  assert.deepEqual(prepared.scenario.spellIds, [205]);
  assert.equal(prepared.scenario.talentPoints, 2);
  assert.equal(p.talentsString.split('-')[2][1], '2');
  assert.equal(p.equipment.items.length, 17);
  assert.deepEqual(p.rotation.priorityList, [
    { action: { castSpell: { spellId: { spellId: 205 } } } },
  ]);
  for (const input of [
    { level: 60 },
    { iterations: 1000000 },
    { durationSeconds: 500 },
    { rotation: 'arbitrary' },
    { targetLevel: 63 },
  ]) {
    assert.equal(simulationInput.safeParse(input).success, false);
  }
});
test('incomplete, unsupported, changed and mismatched character data cannot produce a DPS result', async () => {
  const cases = [
    (s: any) => {
      s.sections.character.data.class = 'UNKNOWN';
    },
    (s: any) => {
      s.sections.character.data.level = 0;
    },
    (s: any) => {
      s.sections.character.data.game = 'Classic';
    },
    (s: any) => {
      s.sections.spells.data.known = [{ id: 116 }];
    },
    (s: any) => {
      s.sections.talents.data.selected = [{ id: 999999, rank: 1 }];
    },
    (s: any) => {
      s.sections.talents.data.selected = [{ id: 11070, rank: 5 }];
    },
    (s: any) => {
      s.sections.talents.data.hasPendingChanges = true;
    },
    (s: any) => {
      s.sections.gear.status = 'unavailable';
    },
    (s: any) => {
      s.sections.gear.data.items = [{ id: 99999999, slot: 1, link: 'item:99999999' }];
    },
  ];
  for (const change of cases) {
    const snapshot = mageSnapshot();
    change(snapshot);
    const result = await simulator.run(snapshot, input);
    assert.equal(result.status, 'unavailable');
    assert.ok(!('dps' in result));
  }
});
test(
  'native pinned WoWSims executes a nonzero level-11 simulation',
  { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
  async () => {
    const result = await simulator.run(mageSnapshot(), { ...input, iterations: 100 });
    assert.equal(result.status, 'available', JSON.stringify(result));
    if (result.status === 'available' && 'results' in result) {
      assert.equal(result.character.level, 11);
      assert.equal(result.results[0].scenario.targetLevel, 11);
      assert.ok(result.results[0].dps.average > 0);
      assert.ok(result.results[0].damageBySpell.some((s: any) => s.spellId === 205));
    }
  },
);

test(
  'native level-11 comparison executes an opener, cooldown, channel and equipped wand',
  { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
  async () => {
    const snapshot = mageSnapshot();
    snapshot.sections.spells.data.known.push(...[2136, 5143, 5019, 122].map((id) => ({ id })));
    snapshot.sections.gear.data.items.push({
      slot: 18,
      id: 11287,
      link: '|Hitem:11287::::::::11:::::::::|h[Wand]|h',
    });
    const result = await simulator.run(snapshot, {
      targetDistanceYards: 5,
      iterations: 100,
      plans: [
        { label: 'Frostbolt', priority: [{ spellId: 205 }] },
        {
          label: 'Opening into wand',
          opener: [{ spellId: 205 }, { spellId: 122 }, { spellId: 2136 }, { spellId: 5143 }],
          priority: [{ spellId: 5019 }],
        },
        {
          label: 'Cooldown priorities',
          priority: [{ spellId: 2136 }, { spellId: 5019, manaBelowPercent: 20 }, { spellId: 205 }],
        },
      ],
    });
    assert.equal(result.status, 'available', JSON.stringify(result));
    if (result.status === 'available') {
      assert.equal(result.results.length, 3);
      const spells = result.results[1].damageBySpell.map((a: any) => a.spellId);
      for (const id of [205, 122, 2136, 5143, 5019]) {
        assert.ok(spells.includes(id), 'requested spell dealt damage: ' + id);
      }
      assert.ok(Number.isFinite(result.results[1].relativeToFirstPercent));
      const blast = (i: number) =>
        result.results[i].damageBySpell.find((a: any) => a.spellId === 2136)?.damagePerFight ?? 0;
      assert.ok(
        blast(2) > blast(1) * 2,
        'priority list reuses Fire Blast as its cooldown becomes ready',
      );
    }
  },
);

const classMetadata = JSON.parse(readFileSync('simulator/classes.json', 'utf8')) as Record<
  string,
  ClassMetadata
>;
const baselineFamilies: Record<string, string> = {
  MAGE: 'Fireball',
  WARRIOR: 'HeroicStrike',
  ROGUE: 'SinisterStrike',
  HUNTER: 'ArcaneShot',
  PALADIN: 'SealOfRighteousness',
  PRIEST: 'Smite',
  SHAMAN: 'LightningBolt',
  WARLOCK: 'ShadowBolt',
  DRUID: 'Wrath',
};
function classFixture(token: string, level: number) {
  const snapshot = mageSnapshot(level);
  snapshot.sections.character.data.class = token;
  snapshot.sections.character.data.raceToken =
    token === 'SHAMAN' ? 'Orc' : token === 'DRUID' ? 'NightElf' : 'Human';
  snapshot.sections.talents.data.selected = [];
  const metadata = classMetadata[token];
  const known = Object.values(metadata.ranks)
    .flat()
    .filter((r) => r.level <= level)
    .map((r) => ({ id: r.id }));
  if (token === 'HUNTER') {
    known.push({ id: 75 });
  }
  snapshot.sections.spells.data.known = known;
  const weapon = token === 'PALADIN' ? 2847 : 2218;
  if (adapters[token].melee) {
    snapshot.sections.gear.data.items.push({ slot: 16, id: weapon, link: 'item:' + weapon });
  }
  if (token === 'HUNTER') {
    snapshot.sections.gear.data.items.push({ slot: 18, id: 2505, link: 'item:2505' });
  }
  const spellId = metadata.ranks[baselineFamilies[token]]
    .filter((r) => r.level <= level)
    .at(-1)!.id;
  const plan = { label: token, priority: [{ spellId }] };
  return { snapshot, input: { plans: [plan], iterations: 100 } };
}
for (const token of Object.keys(adapters)) {
  for (const level of [11, 30, 60]) {
    test(
      `native ${token} damage at level ${level} uses the real adapter`,
      { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
      async () => {
        const fixture = classFixture(token, level);
        const result = await simulator.run(fixture.snapshot, fixture.input);
        assert.equal(result.status, 'available', JSON.stringify(result));
        if (result.status !== 'available') {
          return;
        }
        assert.equal(result.character.class, token);
        assert.ok(result.results[0].dps.average > 0);
        assert.ok(
          result.results[0].damageBySpell.some(
            (s: any) => s.spellId === fixture.input.plans[0].priority[0].spellId,
          ),
        );
      },
    );
  }
}

test(
  'equipment sets compare the same plan and preserve the original snapshot',
  { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
  async () => {
    const snapshot = mageSnapshot();
    const original = structuredClone(snapshot);
    const result = await simulator.run(snapshot, {
      ...input,
      iterations: 100,
      equipmentSets: [{ label: 'Channeling ring', replacements: [{ slot: 11, itemId: 1449 }] }],
    });
    assert.deepEqual(snapshot, original);
    assert.equal(result.status, 'available', JSON.stringify(result));
    if (result.status !== 'available') {
      return;
    }
    assert.equal(result.results.length, 2);
    assert.equal(result.results[1].planIndex, 0);
    assert.equal(result.results[1].equipmentLabel, 'Channeling ring');
    assert.equal(result.results[0].equipmentDeltaDps, 0);
    assert.equal(
      result.results[1].equipmentDeltaDps,
      result.results[1].dps.average - result.results[0].dps.average,
    );
    assert.ok(result.results[1].scenario.equipment.some((i) => i.slot === 11 && i.id === 1449));
  },
);

test('candidate equipment rejects invalid slots, levels, class, duplicates and unsupported overrides', async () => {
  for (const replacements of [
    [{ slot: 11, itemId: 99999999 }],
    [{ slot: 11, itemId: 11287 }],
    [
      { slot: 11, itemId: 1449 },
      { slot: 11, itemId: 1116 },
    ],
    [{ slot: 7, itemId: 2978 }],
    [
      { slot: 16, itemId: 2847 },
      { slot: 17, itemId: 2847 },
    ],
  ]) {
    await assert.rejects(simulator.prepare(mageSnapshot(), input, replacements));
  }
  assert.equal(
    simulationInput.safeParse({
      ...input,
      equipmentSets: [
        {
          label: 'Unsafe stats',
          replacements: [{ slot: 11, itemId: 1449, stats: { spellPower: 999 } }],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    simulationInput.safeParse({
      ...input,
      equipmentSets: [
        { label: 'Enchanted', replacements: [{ slot: 11, itemId: 1449, enchant: 123 }] },
      ],
    }).success,
    false,
  );
});

test('non-mana conditions and class distance defaults are validated', async () => {
  const fixture = classFixture('ROGUE', 11);
  const prepared = await simulator.prepare(fixture.snapshot, {
    plans: [
      {
        label: 'Builder/finisher',
        priority: [
          { spellId: 6760, comboPointsAtLeast: 5 },
          { spellId: 1757, energyAbove: 40 },
        ],
      },
    ],
  });
  assert.equal(prepared.scenario.targetDistanceYards, 5);
  await assert.rejects(
    simulator.prepare(fixture.snapshot, { ...fixture.input, targetDistanceYards: 20 }),
  );
  await assert.rejects(
    simulator.prepare(fixture.snapshot, {
      plans: [{ label: 'Wrong resource', priority: [{ spellId: 1757, manaBelowPercent: 20 }] }],
    }),
  );
});

for (const [token, adapter] of Object.entries(adapters)) {
  for (const family of adapter.families) {
    test(
      `native ${token}/${family} executes its declared action`,
      { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
      async () => {
        const fixture = classFixture(token, 60);
        if (family === 'Incinerate') {
          fixture.snapshot.sections.talents.data.selected = classMetadata.WARLOCK.talents[2].map(
            (t) => ({ id: t.id, rank: t.max }),
          );
        }
        const spellId = classMetadata[token].ranks[family].at(-1)!.id;
        const filler = fixture.input.plans[0].priority[0];
        const action = { spellId };
        const utility = ['Bloodrage', 'HuntersMark', 'AspectOfTheHawk', 'RapidFire'].includes(
          family,
        );
        const opener = token === 'PALADIN' ? [{ spellId: 20293 }] : utility ? [action] : [];
        const priority = utility
          ? [filler]
          : family === 'Eviscerate'
            ? [{ spellId, comboPointsAtLeast: 3 }, filler]
            : [action, filler];
        const result = await simulator.run(fixture.snapshot, {
          plans: [{ label: family, opener, priority }],
          targetDistanceYards: token === 'HUNTER' ? 20 : 5,
          iterations: 100,
        });
        assert.equal(result.status, 'available', JSON.stringify(result));
        if (result.status !== 'available') {
          return;
        }
        const report = result.results[0];
        if (utility) {
          assert.ok(
            report.castsBySpell.some((a) => a.spellId === spellId && a.castsPerFight > 0),
            JSON.stringify(report),
          );
        } else {
          assert.ok(
            report.damageBySpell.some((a) => a.spellId === spellId && a.damagePerFight > 0),
            JSON.stringify(report),
          );
        }
      },
    );
  }
}

test(
  'native DoT refresh conditions maintain damage over time while allowing a filler',
  { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
  async () => {
    const fixture = classFixture('WARLOCK', 30);
    const result = await simulator.run(fixture.snapshot, {
      plans: [
        {
          label: 'Maintain Corruption',
          priority: [
            { spellId: 6223, dotRefreshBelowSeconds: 1 },
            fixture.input.plans[0].priority[0],
          ],
        },
      ],
      iterations: 100,
    });
    assert.equal(result.status, 'available', JSON.stringify(result));
    if (result.status === 'available') {
      for (const id of [6223, fixture.input.plans[0].priority[0].spellId]) {
        assert.ok(result.results[0].damageBySpell.some((a) => a.spellId === id));
      }
      const casts = result.results[0].castsBySpell.find((a) => a.spellId === 6223)!.castsPerFight;
      assert.ok(casts >= 1 && casts < 4, 'Corruption is refreshed, not spammed');
    }
  },
);

test(
  'equipment comparisons keep a separate baseline for every rotation',
  { skip: !existsSync('simulator/wowsimcli.exe'), timeout: 60000 },
  async () => {
    const result = await simulator.run(mageSnapshot(), {
      plans: [input.plans[0], { label: 'Fireball', priority: [{ spellId: 143 }] }],
      iterations: 100,
      equipmentSets: [
        { label: 'Ring A', replacements: [{ slot: 11, itemId: 1449 }] },
        { label: 'Ring B', replacements: [{ slot: 11, itemId: 1116 }] },
      ],
    });
    assert.equal(result.status, 'available', JSON.stringify(result));
    if (result.status !== 'available') {
      return;
    }
    assert.equal(result.results.length, 6);
    for (const report of result.results) {
      const baselineDps: number = result.results[report.planIndex].dps.average;
      assert.equal(report.equipmentDeltaDps, report.dps.average - baselineDps);
      assert.equal(report.scenario.iterations, 100);
      assert.equal(report.scenario.targetLevel, 11);
    }
  },
);

test('talent-granted actions and DoT conditions reject inconsistent plans', async () => {
  const fixture = classFixture('WARLOCK', 60);
  await assert.rejects(
    simulator.prepare(fixture.snapshot, {
      plans: [{ label: 'Missing talent', priority: [{ spellId: 1293813 }] }],
    }),
    /applied talent/,
  );
  await assert.rejects(
    simulator.prepare(mageSnapshot(), {
      plans: [{ label: 'Not a dot', priority: [{ spellId: 205, dotRefreshBelowSeconds: 1 }] }],
    }),
    /damage-over-time/,
  );
});

import { replaceEquipment, type CatalogItem } from '../apps/bridge/src/simulation/equipment.ts';
test('weapon combinations require explicit off-hand removal and replacements do not inherit enchants', () => {
  const catalog = new Map<number, CatalogItem>([
    [1, { id: 1, name: 'Dagger', type: 13, weaponType: 2, handType: 2 }],
    [2, { id: 2, name: 'Staff', type: 13, weaponType: 8, handType: 4 }],
    [3, { id: 3, name: 'Off-hand', type: 13, weaponType: 5, handType: 3 }],
    [4, { id: 4, name: 'High-level ring', type: 11, reqLvl: 60 }],
    [5, { id: 5, name: 'Unique ring', type: 11, unique: true }],
    [6, { id: 6, name: 'Warrior ring', type: 11, classAllowlist: [1] }],
  ]);
  const current = [
    { slot: 16, id: 1, link: 'item:1:123:0:0:0:0:99' },
    { slot: 17, id: 3, link: 'item:3' },
  ];
  const original = structuredClone(current);
  assert.throws(
    () => replaceEquipment(current, [{ slot: 16, itemId: 2 }], catalog, 'MAGE', 11, 'Human'),
    /explicit removal/,
  );
  const replaced = replaceEquipment(
    current,
    [
      { slot: 16, itemId: 2 },
      { slot: 17, itemId: 0 },
    ],
    catalog,
    'MAGE',
    11,
    'Human',
  );
  assert.deepEqual(replaced, [{ slot: 16, id: 2, link: 'item:2' }]);
  assert.deepEqual(current, original);
  for (const replacements of [
    [{ slot: 11, itemId: 4 }],
    [
      { slot: 11, itemId: 5 },
      { slot: 12, itemId: 5 },
    ],
    [{ slot: 11, itemId: 6 }],
  ]) {
    assert.throws(() => replaceEquipment(current, replacements, catalog, 'MAGE', 11, 'Human'));
  }
});
