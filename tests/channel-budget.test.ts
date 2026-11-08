import { ReplyProjection } from '@wisp/bridge/reply-stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { applyEvent, type Chat } from '@wisp/bridge/events';
import { SnapshotGate } from '@wisp/bridge/snapshots';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

test('invisible stream events and unchanged snapshots do not spend revisions', () => {
  const chat: Chat = {
    id: 'chat',
    owner: 'game',
    title: 'Test',
    status: 'working',
    activity: [],
    messages: [],
  };
  const gate = new SnapshotGate(100),
    parts = new ReplyProjection();
  const view = () => ({ session: 'game', chats: [chat], acks: [1], connected: true });
  assert.equal(gate.next(view())?.rev, 101);
  for (let index = 0; index < 10000; index++) {
    assert.equal(
      applyEvent(
        chat,
        { type: 'content.delta', data: { kind: 'reasoning', delta: 'private' } },
        parts,
      ),
      false,
    );
    assert.equal(gate.next(view()), null);
  }
  const call = {
    type: 'call.requested',
    data: {
      callId: 'tool',
      capability: { kind: 'tool', name: 'inspect_target', label: 'Inspecting target' },
    },
  };
  assert.equal(applyEvent(chat, call, parts), true);
  assert.equal(gate.next(view())?.rev, 102);
  assert.equal(
    applyEvent(
      chat,
      { type: 'call.progress', data: { callId: 'tool', label: 'Inspecting target' } },
      parts,
    ),
    false,
  );
  assert.equal(gate.next(view()), null);
  assert.equal(
    applyEvent(
      chat,
      { type: 'call.settled', data: { callId: 'tool', outcome: 'completed' } },
      parts,
    ),
    true,
  );
  assert.equal(gate.next(view())?.rev, 103);
  assert.equal(
    applyEvent(
      chat,
      { type: 'call.settled', data: { callId: 'tool', outcome: 'completed' } },
      parts,
    ),
    false,
  );
  gate.invalidate();
  assert.equal(gate.next(view())?.rev, 104, 'a failed disk write must remain retryable');
});

function transportHarness() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(readFileSync('tests/fixtures/transport.lua', 'utf8'));
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Transport.lua', 'utf8'))}))('WispAI',C); C.StartTransport()`,
  );
  return run;
}

test('idle clients consume no channels, duplicate replies back off, and user actions wake reads', () => {
  const run = transportHarness();
  run(
    `
C.Send({ type = "hello" })
nextRev = 1
timers[0.5]()
assert(loads == 1)
for index = 1, 7200 do
    now = now + 0.5
    if index % 120 == 0 then
        timers[60]()
    end
    timers[0.5]()
end
assert(
    loads == 1 and C.slot == 2,
    "cached sound positives and an hour of heartbeats must consume zero idle channels"
)
`,
  );
  run(
    `
C.chats[1].status = "working"
local before = loads
for index = 1, 240 do
    now = now + 0.5
    timers[0.5]()
end
assert(loads - before < 24, "duplicate payloads must back off, not burn two slots per second")
local before = loads
C.Send({ type = "say", text = "new message" })
nextRev = 2
timers[0.5]()
assert(loads == before + 1 and C.rev == 2, "new actions must bypass the backoff immediately")
`,
  );
});

test('startup keeps reading after hello is acknowledged while the agent is still starting', () => {
  const run = transportHarness();
  run(`
C.Send({ type = "hello" })
nextRev = 1
nextConnected = false
timers[0.5]()
assert(loads == 1 and not C.connected)
now = 1
nextRev = 2
nextConnected = true
timers[0.5]()
assert(loads == 2 and C.connected, "ready snapshot must be read without another user message")
now = 2
timers[0.5]()
assert(loads == 2, "connected idle clients must stop consuming channels")
`);
});

test('connection does not depend on sound settings or playable audio files', () => {
  const run = transportHarness();
  run(`
function PlaySoundFile()
    error("Audio must not gate transport")
end
C.Send({ type = "hello" })
nextRev = 1
nextConnected = true
timers[0.5]()
assert(loads == 1 and C.connected, "hello must complete with audio unavailable")
`);
});
