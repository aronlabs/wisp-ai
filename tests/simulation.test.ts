import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Simulator } from '@wisp/bridge/simulation';
import { simulationInput } from '@wisp/protocol/simulation';
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
      s.sections.character.data.class = 'WARRIOR';
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
  { skip: !existsSync('simulator/wowsimcli.exe') },
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
  { skip: !existsSync('simulator/wowsimcli.exe') },
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
