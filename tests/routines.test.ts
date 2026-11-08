import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RoutineStore } from '@wisp/bridge/routines';
import { routineDefinition, routineInput, matchesRoutineEvent } from '@wisp/protocol/routines';

const definition = () =>
  routineDefinition.parse({
    id: 'mage',
    title: 'Mage review',
    instruction: 'Read current spells and advise only if useful.',
    triggers: [
      {
        kind: 'event',
        event: 'level_up',
        filters: [{ field: 'level', op: 'multiple_of', value: 2 }],
      },
    ],
    cooldownSeconds: 60,
  });
async function fixture(work: (store: RoutineStore, file: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-routines-'));
  try {
    const file = path.join(root, 'routines.json');
    await work(new RoutineStore(file), file);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('event definitions reject invented capabilities, invalid operators and executable extras', () => {
  const d = definition();
  expect(matchesRoutineEvent(d.triggers[0], { event: 'level_up', values: { level: 24 } })).toBe(
    true,
  );
  expect(matchesRoutineEvent(d.triggers[0], { event: 'level_up', values: { level: 25 } })).toBe(
    false,
  );
  expect(matchesRoutineEvent(d.triggers[0], { event: 'level_up', values: {} })).toBe(false);
  for (const triggers of [
    [{ kind: 'event', event: 'invented' }],
    [{ kind: 'event', event: 'level_up', filters: [{ field: 'gold', op: 'eq', value: 1 }] }],
    [{ kind: 'event', event: 'level_up', filters: [{ field: 'level', op: 'contains', value: 2 }] }],
    [
      {
        kind: 'event',
        event: 'level_up',
        filters: [{ field: 'level', op: 'multiple_of', value: 0 }],
      },
    ],
    [{ kind: 'interval', seconds: 1 }],
  ]) {
    expect(routineDefinition.safeParse({ ...d, triggers }).success).toBe(false);
  }
  expect(
    routineInput.safeParse({ operation: 'save', routine: { ...d, script: 'run()' } }).success,
  ).toBe(false);
});
test('pending events survive restart, coalesce, respect cooldown and stay character scoped', async () =>
  fixture(async (store, file) => {
    const start = 1000000;
    await store.mutate(
      'mage',
      { operation: 'save', routine: definition() },
      'creation-chat',
      start,
    );
    await store.observe('other', { event: 'level_up', values: { level: 24 } }, start);
    expect(await store.claim('mage', start)).toBeNull();
    await store.observe('mage', { event: 'level_up', values: { level: 24 } }, start);
    await store.observe('mage', { event: 'level_up', values: { level: 26 } }, start + 1);
    const restored = new RoutineStore(file);
    await restored.load();
    const claims = await Promise.all([
      restored.claim('mage', start + 2),
      restored.claim('mage', start + 2),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    expect(first.event.values.level).toBe(26);
    expect(first.routine.sourceChatId).toBe('creation-chat');
    await restored.finish(first.run.id, 'done', 'Train the verified spell.', start + 3);
    await restored.observe('mage', { event: 'level_up', values: { level: 28 } }, start + 4);
    expect(await restored.claim('mage', start + 1000)).toBeNull();
    const second = (await restored.claim('mage', start + 60002))!;
    expect(second.run.id).not.toBe(first.run.id);
    expect(second.previous).toEqual(['Train the verified spell.']);
    const again = new RoutineStore(file);
    await again.load();
    expect(again.runs.at(-1)?.status).toBe('interrupted');
    expect(await again.claim('mage', start + 200000)).toBeNull();
  }));
test('pause clears pending work; intervals coalesce offline time; once waits for a useful result', async () =>
  fixture(async (store) => {
    const start = 1000000;
    const routine = {
      ...definition(),
      triggers: [{ kind: 'interval' as const, seconds: 60 }],
      once: true,
    };
    await store.mutate('mage', { operation: 'save', routine }, undefined, start);
    expect(await store.claim('mage', start + 59000)).toBeNull();
    await store.mutate('mage', { operation: 'pause', id: routine.id }, undefined, start);
    expect(await store.claim('mage', start + 500000)).toBeNull();
    await store.mutate('mage', { operation: 'resume', id: routine.id }, undefined, start + 500000);
    expect(await store.claim('mage', start + 500000)).toBeNull();
    const silent = (await store.claim('mage', start + 900000))!;
    await store.finish(silent.run.id, 'no_tip', '', start + 900001);
    expect(store.list('mage')[0].enabled).toBe(true);
    const useful = (await store.claim('mage', start + 9999999))!;
    await store.finish(useful.run.id, 'done', 'Goal reached', start + 10000000);
    expect(await store.claim('mage', start + 19999999)).toBeNull();
    expect(store.list('mage')[0].enabled).toBe(false);
    await expect(store.mutate('other', { operation: 'remove', id: routine.id })).rejects.toThrow(
      'not found',
    );
  }));

test('dispatch deferred by a new user turn restores the pending one-shot without a phantom run', async () =>
  fixture(async (store) => {
    const now = 1000000;
    await store.mutate(
      'mage',
      { operation: 'save', routine: { ...definition(), once: true } },
      undefined,
      now,
    );
    await store.observe('mage', { event: 'level_up', values: { level: 24 } }, now);
    const claimed = (await store.claim('mage', now + 1))!;
    await store.defer(claimed.run.id, claimed.event);
    expect(store.runs).toHaveLength(0);
    expect(store.list('mage')[0].enabled).toBe(true);
    expect(await store.claim('mage', now + 2)).not.toBeNull();
  }));
