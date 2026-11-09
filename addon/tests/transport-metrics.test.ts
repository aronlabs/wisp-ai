import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function harness() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(`
now=0;hooks={};sent={};created=0
function GetTimePreciseSec()return now end
function CreateFrame()
 created=created+1
 widget={SetScript=function(self,_,fn)self.update=fn end,Hide=function(self)self.hidden=true end,Show=function(self)self.hidden=false end}
 return widget
end
C_AddOns={SaveAddOns=function()end,ResetAddOns=function()end,LoadAddOn=function()end}
function hooksecurefunc(_,key,fn)hooks[key]=fn end
C={transportStats={compactAck=true},Send=function(packet)sent[#sent+1]=packet end}
`);
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/TransportMetrics.lua', 'utf8'))}))('WispAI',C)`,
  );
  return run;
}
test('profiling stays opt-in, captures frame percentiles and stops without an idle OnUpdate', () => {
  const run = harness();
  run(`
assert(created==0 and next(hooks)==nil)
C.RecordTransportOperation('ack',900)
assert(not pcall(C.StartTransportProfile,'',2))
C.StartTransportProfile('fixture',2)
assert(created==1 and sent[1].data.event=='transport_profile_start')
assert(not pcall(C.StartTransportProfile,'overlap',2))
hooks.SaveAddOns();hooks.SaveAddOns();hooks.ResetAddOns()
for i=1,100 do now=now+.01;widget.update(widget,.01)end
C.RecordTransportOperation('ack',3)
C.RecordTransportOperation('ack',5)
now=2.01;widget.update(widget,.02)
local result=C.lastTransportProfile
assert(widget.hidden and result.frames.count==101)
assert(result.frames.p50==10 and result.frames.p95==10 and result.frames.max==20)
assert(result.calls.SaveAddOns==2 and result.calls.ResetAddOns==1)
assert(result.work.ack.count==2 and result.work.ack.mean==4 and result.work.ack.max==5)
assert(sent[2].data.event=='transport_profile')
hooks.SaveAddOns();C.RecordTransportOperation('ack',99)
assert(result.calls.SaveAddOns==2 and result.work.ack.count==2)
assert(C.StopTransportProfile()==nil)
`);
});
test('benchmark state timing aggregates bounded fixture data without calling it visible text', () => {
  const run = harness();
  run(`
C.StartTransportProfile('timing',10)
now=.1;local started=C.BeginTransportApply()
now=.104;C.RecordTransportSnapshot({benchmark={id='stream',step=1,textBytes=3}},started)
now=.2;C.RecordTransportSnapshot({benchmark={id='stream',step=2,textBytes=12,final=true}},nil)
local result=C.StopTransportProfile()
assert(#result.records==1 and result.records[1].count==2)
assert(math.abs(result.records[1].firstTextAppliedMs-104)<.001)
assert(result.records[1].finalAppliedMs==200)
assert(result.work.apply.count==1 and math.abs(result.work.apply.mean-4)<.001)
assert(result.records[1].visibleMs==nil)
`);
  expect(true).toBe(true);
});
