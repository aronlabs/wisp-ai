import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { actionSchema, macroBodyError } from '../src/game-actions.ts';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function vm() {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const run = (code: string) => { if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tolstring(L, -1))); };
  run(`C={db={}}; function time() return 123 end; function UnitName() return 'Mage' end; function GetRealmName() return 'Realm' end; CreateFrame=function() return {RegisterEvent=function() end,SetScript=function() end} end; identity={name='Mage',realm='Realm'};
    function point(id,x,y) return {uiMapID=id,position={GetXY=function() return x,y end}} end; UiMapPoint={CreateFromCoordinates=point};
    C_Map={GetMapInfo=function(id) if id==1 then return {mapID=1,name='Durotar',parentMapID=0} end end,CanSetUserWaypointOnMap=function(id) return id==1 end,GetUserWaypoint=function() return waypoint end,SetUserWaypoint=function(value) waypoint=value; return true end,ClearUserWaypoint=function() waypoint=nil end};
    Constants={MacroConsts={MAX_ACCOUNT_MACROS=120,MAX_CHARACTER_MACROS=30}}; macros={}; creates=0;
    function InCombatLockdown() return combat or false end; function GetNumMacros() return 0,creates end;
    function GetMacroIndexByName(name) for index,macro in pairs(macros) do if macro.name==name then return index end end return 0 end;
    function GetMacroInfo(index) local macro=macros[index]; if macro then return macro.name,134400,macro.body end end;
    function CreateMacro(name,icon,body,perCharacter) creates=creates+1; local index=perCharacter and 120+creates or creates; macros[index]={name=name,body=body}; return index end;
    function RunMacroText() error('must not execute macros') end; function EditMacro() error('must not overwrite') end; function DeleteMacro() error('must not delete') end;
    function act(kind,args) return C.PerformAction({kind=kind,args=args or {},expectedCharacter=identity}) end`);
  run(`assert(load(${JSON.stringify(readFileSync('addon/WispAI/Character.lua', 'utf8'))}))('WispAI',C)`);
  return { run };
}
test('action schemas reject invalid coordinates, arbitrary commands and overlong UTF-8 macro text', () => {
  assert.equal(macroBodyError('#showtooltip\n/cast [@mouseover,help,nodead][] Frostbolt'), undefined);
  for (const body of ['/run print(1)', '/script x=1', '/click Button', '/say hello', '/cast Frostbolt\n/run print(1)', 'hello', '   ']) assert.ok(macroBodyError(body));
  assert.throws(() => actionSchema.parse({ kind: 'set_waypoint', args: { mapId: 1, x: 101, y: 50, label: 'NPC', source: 'user' } }));
  assert.throws(() => actionSchema.parse({ kind: 'create_macro', args: { name: 'Macro', body: '/cast ' + 'é'.repeat(125) } }));
  assert.throws(() => actionSchema.parse({ kind: 'create_macro', args: { name: '   ', body: '/cast Frostbolt' } }));
  assert.throws(() => actionSchema.parse({ kind: 'move', args: {} }));
});
test('map actions convert percent coordinates, verify readback, and undo only their own pin', () => {
  vm().run(`waypoint=point(1,.1,.2); local r=act('set_waypoint',{mapId=1,x=60,y=40,label='NPC',source='user',navigate=false}); assert(r.status=='completed' and r.data.applied); local x,y=waypoint.position:GetXY(); assert(x==.6 and y==.4); r=act('clear_waypoint'); x,y=waypoint.position:GetXY(); assert(r.data.restoredPrevious and x==.1 and y==.2); waypoint=nil; assert(act('set_waypoint',{mapId=1,x=50,y=50,label='A',source='user'}).status=='completed'); assert(act('set_waypoint',{mapId=1,x=60,y=60,label='B',source='user'}).status=='completed'); assert(act('clear_waypoint').status=='completed' and waypoint==nil,'replacing an owned pin must retain the original empty state'); act('set_waypoint',{mapId=1,x=50,y=50,label='A',source='user'}); waypoint=point(1,.7,.8); assert(act('clear_waypoint').status=='blocked'); x,y=waypoint.position:GetXY(); assert(x==.7 and y==.8,'user changes must remain untouched')`);
});
test('unsupported maps and character switches never apply actions', () => {
  vm().run(`assert(act('set_waypoint',{mapId=999,x=10,y=20,label='No',source='user'}).status=='blocked' and waypoint==nil); identity.name='Other'; assert(act('create_macro',{name='Nova',body='/cast Frost Nova',perCharacter=true}).status=='blocked' and creates==0)`);
});
test('optional navigation failures do not hide a successfully placed and verified pin', () => {
  vm().run(`C_SuperTrack={SetSuperTrackedUserWaypoint=function() end,IsSuperTrackingUserWaypoint=function() error('not available') end}; local r=act('set_waypoint',{mapId=1,x=20,y=30,label='NPC',source='user',navigate=true}); assert(r.status=='completed' and r.data.applied and not r.data.navigation); C_SuperTrack.IsSuperTrackingUserWaypoint=function() return true end; r=act('set_waypoint',{mapId=1,x=21,y=31,label='NPC',source='user',navigate=true}); assert(r.data.navigation)`);
});
test('macro creation is verified, idempotent, never overwrites and respects combat/capacity', () => {
  vm().run(String.raw`local args={name='Nova',body='#showtooltip\n/cast Frost Nova',perCharacter=true}; local r=act('create_macro',args); assert(r.status=='completed' and r.data.created and r.data.verified and r.data.scope=='character'); assert(r.data.reference.kind=='macro' and r.data.reference.name=='Nova' and creates==1); r=act('create_macro',args); assert(r.status=='completed' and not r.data.created and creates==1); assert(act('create_macro',{name='Nova',body='/cast Frostbolt',perCharacter=true}).status=='blocked' and creates==1); combat=true; assert(act('create_macro',{name='Bolt',body='/cast Frostbolt',perCharacter=true}).status=='blocked' and creates==1); combat=false; assert(act('create_macro',{name='Lua',body='/run print(1)',perCharacter=true}).status=='blocked' and creates==1); GetNumMacros=function() return 120,30 end; assert(act('create_macro',{name='Full',body='/cast Frostbolt',perCharacter=true}).status=='blocked' and creates==1)`);
});
test('macro inventory hides code by default and includes it only when requested', () => {
  vm().run(`act('create_macro',{name='Nova',body='/cast Frost Nova',perCharacter=true}); local r=C.Inspect({kind='macros',args={}}); assert(r.data.macros[1].name=='Nova' and r.data.macros[1].body==nil); r=C.Inspect({kind='macros',args={names={'Nova'},includeBodies=true}}); assert(r.data.macros[1].body=='/cast Frost Nova')`);
});
