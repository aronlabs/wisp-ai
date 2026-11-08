import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

function transportHarness() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(readFileSync('addon/tests/fixtures/transport.lua', 'utf8'));
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
