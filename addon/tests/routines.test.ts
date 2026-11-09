import { addonSource } from './addon-source.ts';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
test('routine subscriptions debounce events, retain combat readings and stop unused listeners', () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (s: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(s)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(readFileSync('addon/tests/wow-ui-stub.lua', 'utf8'));
  run(`
C = { connected = true, chats = {} }
sent, tickers = {}, {}
C.Send = function(p) sent[#sent + 1] = p end
C.Capture = function() return { character = "mage" } end
C_Timer.NewTicker = function(seconds, fn) tickers[seconds] = fn end
combat = false
InCombatLockdown = function() return combat end
`);
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Advice.lua', 'utf8'))}))('WispAI', C)`,
  );
  run(`
C.InitAdvice()
local events
for _, w in ipairs(UI_TEST.widgets) do if w.scripts.OnEvent then events = w end end
assert(events)
local registered = {}
events.RegisterEvent = function(_, name) registered[name] = true end
events.UnregisterEvent = function(_, name) registered[name] = nil end
C.ReceiveRoutineSubscriptions({{ native = "PLAYER_LEVEL_UP", event = "level_up" }}, true)
assert(registered.PLAYER_LEVEL_UP)
local onEvent = events.scripts.OnEvent
onEvent(events, "PLAYER_LEVEL_UP", 26)
onEvent(events, "PLAYER_LEVEL_UP", 26)
assert(#sent == 0)
combat = true
tickers[2]()
assert(#sent == 1 and sent[1].data.values.level == 26 and sent[1].data.ready == false)
combat = false
tickers[15]()
assert(sent[2].type == "routine_tick" and sent[2].data.ready == true)
C.ReceiveRoutineSubscriptions({}, false)
assert(not registered.PLAYER_LEVEL_UP)
tickers[2]()
tickers[15]()
assert(#sent == 2)
`);
});

test('sidebar groups run conversations under their routine and excludes them from ordinary chats', () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(readFileSync('addon/tests/wow-ui-stub.lua', 'utf8'));
  run('C = {}; SlashCmdList = {}; function time() return 1 end');
  for (const file of ['Core.lua', 'RichUI.lua', 'UI.lua']) {
    run('assert(load(' + JSON.stringify(addonSource(file)) + "))('WispAI', C)");
  }
  run(`
C.db = { sidebar = true, showTools = true, drafts = {} }
C.active, C.connected = "chat", true
C.chats = {
  { id = "chat", title = "Ordinary chat", status = "done", messages = {}, activity = {} },
  { id = "run-one", title = "Level 24 review", routineId = "mage", status = "done", messages = {}, activity = {} }
}
C.routines = {{ id = "mage", title = "Mage review", enabled = true }}
C.routineRuns = {
  { id = "run-one", routineId = "mage", event = "level_up", status = "done", startedAt = 1000000 },
  { id = "quiet", routineId = "mage", event = "level_up", status = "no_tip", startedAt = 2000000 }
}
C.Send = function(packet) UI_TEST.sent = packet end
C.Capture = function() return {} end
C.BuildUI()
local function row(id)
  for _, w in ipairs(UI_TEST.widgets) do
    if w.chatId == id then return w end
  end
end
assert(row("chat"):IsShown())
assert(not row("run-one"), "routine runs must not appear in Chats")
C.sidebarTab = "routines"
C.Refresh()
assert(not row("chat"):IsShown())
local routine = row("routine-header:mage")
assert(routine and routine:IsShown())
routine.scripts.OnClick(routine)
assert(C.sidebarRoutine == "mage")
local result = row("run-one")
assert(result and result:IsShown())
result.scripts.OnClick(result)
assert(C.active == "run-one" and UI_TEST.sent.type == "select")
local quiet = row("quiet")
assert(not quiet, "silent runs must not appear in routine history")
`);
});
