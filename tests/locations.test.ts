import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { npcLocationsInput } from '../src/game-inspection.ts';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function runTest(code: string) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (text: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(text)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(`C={}
    function UnitClass() return 'Mago','MAGE' end
    function UnitFactionGroup() return 'Horde' end
    C_Map={GetBestMapForUnit=function()return 1454 end,GetMapInfo=function(id)if id==1454 then return{name='Orgrimmar'}end end}
    local rows={ [900001]={name='Test service NPC',friendlyToFaction='H',spawns={[1637]={{45,55}}}}, [5885]={name='Deino',subName='Instructor de magos',friendlyToFaction='H',spawns={[1637]={{38.45,86.13},{-1,-1}}}},[999]={name='Other trainer',friendlyToFaction='A',spawns={[1637]={{40,90}}}} }
    LibQuestieDB={flavor={expansion='Forever'},contractVersion=4,RequireContract=function(v)return v==4 end,
      EraToForever=function(_,x,y)return x,y end,GetProvenance=function()return'QuestieDB'end,
      Npc={Exists=function(id)return rows[id]~=nil end,Get=function(id,key)return rows[id]and rows[id][key]end,IdsByName=function(name)if name=='Deino'then return{5885}end end}}
    Questie={IsForever=true}
    local zones={GetUiMapIdByAreaId=function(_,area)if area==1637 then return 1454 end end,GetAreaIdByUiMapId=function(_,map)if map==1454 then return 1637 end end}
    QuestieLoader={ImportModule=function(_,name)if name=='ZoneDB'then return zones elseif name=='Townsfolk'then return{GetClassTrainers=function()return{MAGE={5885,999}}end,townsfolk={Transmogrifier={900001}}}end end}
  `);
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Locations.lua', 'utf8'))}))('WispAI',C)`,
  );
  run(code);
}
test('Forever class-trainer lookup returns native-map spawn references with provenance', () =>
  runTest(`
  local result=C.FindNPCLocations({mode='class_trainers',class='MAGE',mapId=1454})
  assert(result.status=='available'and result.total==1)
  local pin=result.locations[1]
  assert(pin.npcId==5885 and pin.name=='Deino'and pin.mapId==1454 and pin.areaId==1637)
  assert(pin.x==38.45 and pin.y==86.13 and pin.reference.kind=='map'and pin.reference.mapId==1454)
  assert(pin.provenance=='QuestieDB'and result.version=='forever')
  assert(C.FindNPCLocations({mode='npc',name='Deino'}).total==1)
`));
test('other versions, unknown maps and ambiguous coordinate frames never become pins', () =>
  runTest(`
  LibQuestieDB.flavor.expansion='Classic'
  assert(not pcall(C.FindNPCLocations,{mode='class_trainers'}))
  LibQuestieDB.flavor.expansion='Forever'
  assert(not pcall(C.FindNPCLocations,{mode='class_trainers',mapId=9999}))
  LibQuestieDB.EraToForever=function(_,x,y)return x+5,y end
  local result=C.FindNPCLocations({mode='npc',npcId=5885})
  assert(result.status=='no_matches'and #result.locations==0 and result.skippedUnverifiedFrames==1)
  LibQuestieDB.EraToForever=nil
  assert(C.FindNPCLocations({mode='npc',npcId=5885}).total==0)
  LibQuestieDB=nil
  assert(not pcall(C.FindNPCLocations,{mode='class_trainers'}))
`));
test('NPC lookup inputs remain bounded and cannot select a different database version', () => {
  assert.ok(
    npcLocationsInput.safeParse({ mode: 'services', service: 'Transmogrifier', mapId: 1454 })
      .success,
  );
  assert.ok(
    npcLocationsInput.safeParse({ mode: 'class_trainers', class: 'MAGE', mapId: 1454 }).success,
  );
  for (const input of [
    {},
    { npcId: 0 },
    { mode: 'services' },
    { mode: 'services', service: 'invented' },
    { name: '' },
    { name: 'Deino', version: 'classic' },
    { mode: 'class_trainers', limit: 10000 },
  ]) {
    assert.equal(npcLocationsInput.safeParse(input).success, false);
  }
});
test('service lookup discovers transmog NPCs without a personal name', () =>
  runTest(`
  LibQuestieDB.Npc.IdsByName=function()error('A service query must not search a guessed NPC name')end
  local result=C.FindNPCLocations({mode='services',service='Transmogrifier',mapId=1454})
  assert(result.status=='available'and result.total==1)
  assert(result.locations[1].npcId==900001 and result.locations[1].reference.x==45 and result.locations[1].reference.y==55)
  assert(not pcall(C.FindNPCLocations,{mode='services',service='Unknown'}))
`));
