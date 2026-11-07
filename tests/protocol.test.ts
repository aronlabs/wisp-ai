import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { FrameDecoder, parseFrame, luaJson } from '../src/protocol.ts';
function frames(body: unknown, start = 0) {
  const compressed = deflateSync(Buffer.from(JSON.stringify(body))); const size = Buffer.alloc(2); size.writeUInt16BE(compressed.length);
  const stream = Buffer.concat([size, compressed]); const out = [];
  for (let i = 0; i < stream.length; i += 15) { const f = Buffer.alloc(16); f[0] = (i === 0 ? 128 : 0) + ((start + out.length) % 128); stream.copy(f, 1, i, i + 15); out.push(f); }
  return out;
}
const message = { type: 'say', session: 'test-ui', seq: 3, at: 1234, text: '¿Qué hago ahora? Frost Nova ❄' };
test('enabled/disabled bits preserve all byte positions', () => {
  const expected = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 17));
  const text = Array.from({ length: 128 }, (_, i) => `WispAI_B${String(i + 1).padStart(3, '0')}: ${expected[i >> 3] & (0x80 >> (i % 8)) ? 'enabled' : 'disabled'}`).join('\r\n');
  assert.deepEqual(parseFrame(text), expected); assert.equal(parseFrame(text.replace('B128', 'B129')), null);
});
test('compressed multilingual packets survive duplicate frames and counter wrap', () => {
  const decoder = new FrameDecoder(); let result;
  for (const frame of frames(message, 126)) { result = decoder.add(frame) || result; assert.equal(decoder.add(frame), null); }
  assert.deepEqual(result, message);
});
test('a missing frame never becomes a partial message; a retry recovers', () => {
  const decoder = new FrameDecoder(); const long = { ...message, text: Array.from({ length: 200 }, (_, i) => `${i} different words`).join(' ') };
  const first = frames(long); assert.ok(first.length > 3);
  for (const frame of first.filter((_, i) => i !== 1)) assert.equal(decoder.add(frame), null);
  let result; for (const frame of frames(long, first.length)) result = decoder.add(frame) || result;
  assert.deepEqual(result, long);
});
test('an initial stale file is a baseline, never a replayed request', () => {
  const decoder = new FrameDecoder(); const old = frames(message); decoder.baseline(old[0]);
  assert.equal(decoder.add(old[0]), null);
});
test('payload strings cannot terminate the Lua long string', () => {
  const payload = luaJson(JSON.stringify({ text: ']=] ]] ]==] print("bad")' }));
  assert.ok(payload.startsWith('WispAI_Receive([===['));
});
