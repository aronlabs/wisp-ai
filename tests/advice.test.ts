import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdviceGate } from '@wisp/bridge/advice';
import { ReplyStream } from '@wisp/bridge/reply-stream';
test('automatic advice is opt-in, deduplicated, rate limited, fresh and quiet while busy', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wow-advice-'));
  try {
    const file = path.join(root, 'advice.json'),
      gate = new AdviceGate(file);
    await gate.load();
    const now = 10000000,
      event = { kind: 'level_up' as const, level: 11 };
    assert.equal(
      gate.accept('mage', event, now, now, { levelUp: false, weapon: false }, false),
      false,
    );
    assert.equal(
      gate.accept('mage', event, now, now, { levelUp: true, weapon: false }, true),
      false,
    );
    assert.equal(
      gate.accept('mage', event, now - 100000, now, { levelUp: true, weapon: false }, false),
      false,
    );
    assert.equal(
      gate.accept('mage', event, now, now, { levelUp: true, weapon: false }, false),
      true,
    );
    await gate.save();
    const next = new AdviceGate(file);
    await next.load();
    assert.equal(
      next.accept(
        'mage',
        event,
        now + 700000,
        now + 700000,
        { levelUp: true, weapon: true },
        false,
      ),
      false,
    );
    assert.equal(
      next.accept(
        'mage',
        { kind: 'weapon', itemId: 1, slot: 18 },
        now + 1000,
        now + 1000,
        { levelUp: true, weapon: true },
        false,
      ),
      false,
    );
    assert.equal(
      next.accept(
        'mage',
        { kind: 'level_up', level: 12 },
        now + 700000,
        now + 700000,
        { levelUp: true, weapon: false },
        false,
      ),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('a no-tip response carries no visible content or malformed JSON', () => {
  const reply = new ReplyStream();
  reply.feed('{"type":"no_tip"}\n');
  reply.finish();
  assert.equal(reply.noTip, true);
  assert.equal(reply.view().text, '');
  assert.deepEqual(reply.view().ui, []);
  assert.deepEqual(reply.errors, []);
});
