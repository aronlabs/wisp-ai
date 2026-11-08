import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

test('Lua discovery distinguishes missing, wrong-version, partial and complete Questie providers', () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run('C={}; C_AddOns={GetAddOnMetadata=function() return "test" end}');
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Integrations.lua', 'utf8'))}))('WispAI',C)`,
  );
  run(`
    assert(C.IntegrationReport().questie.status=='missing')
    LibQuestieDB={flavor={expansion='Classic'},RequireContract=function()return true end,Npc={Get=function()end,Exists=function()end}}
    assert(C.IntegrationReport().questie.status=='incompatible')
    LibQuestieDB.flavor.expansion='Forever'
    assert(C.IntegrationReport().questie.status=='partial')
    Questie={IsForever=true}; QuestieLoader={ImportModule=function()error('not ready')end}
    assert(C.IntegrationReport().questie.status=='partial')
    QuestieLoader.ImportModule=function()return{GetClassTrainers=function()end,townsfolk={}}end
    assert(C.IntegrationReport().questie.status=='ready')
    LibQuestieDB.RequireContract=function()error('contract mismatch')end
    assert(C.IntegrationReport().questie.status=='incompatible')
  `);
});
