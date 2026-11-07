import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { DiskTransport } from '../src/transport.ts';
test('a reply published during a slot load is reannounced at the next slot', async () => {
  const base = path.resolve('runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'transport-test-'));
  const signals = path.join(root, 'Interface', 'AddOns', 'WispAI', 'Signals'); await mkdir(signals, { recursive: true });
  const bridge = new DiskTransport(root, () => {});
  try {
    await bridge.publish({ v: 1, rev: 1, text: 'first' });
    assert.ok((await readFile(path.join(signals, 'Ready0001.wav'))).length > 0);
    await bridge.publish({ v: 1, rev: 2, text: 'second' });
    bridge.setCursor(2, 1); await bridge.writing;
    assert.ok((await readFile(path.join(signals, 'Ready0002.wav'))).length > 0);
    const payload = await readFile(path.join(root, 'Interface', 'AddOns', 'WispAI_Payload', 'Payload.lua'), 'utf8');
    assert.ok(payload.includes('second'));
    bridge.setCursor(3, 2); await bridge.writing;
    await assert.rejects(readFile(path.join(signals, 'Ready0003.wav')), { code: 'ENOENT' });
    bridge.setCursor(1, 2); assert.equal(bridge.nextSlot, 3, 'late packets cannot rewind the slot');
    bridge.setCursor(4, 1); await bridge.writing;
    await assert.rejects(readFile(path.join(signals, 'Ready0004.wav')), { code: 'ENOENT' });
    assert.equal(bridge.peerRevision, 2, 'an old queued packet cannot undo a newer acknowledgement and reannounce consumed data');
  } finally {
    bridge.stop(); assert.ok(path.resolve(root).startsWith(base + path.sep)); await rm(root, { recursive: true, force: true });
  }
});
