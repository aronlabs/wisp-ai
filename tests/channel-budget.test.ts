import { ReplyProjection } from '../src/reply-stream.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { applyEvent, type Chat } from '../src/events.ts';
import { SnapshotGate } from '../src/snapshots.ts';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

test('invisible stream events and unchanged snapshots do not spend revisions', () => {
  const chat: Chat = { id: 'chat', owner: 'game', title: 'Test', status: 'working', activity: [], messages: [] };
  const gate = new SnapshotGate(100), parts = new ReplyProjection();
  const view = () => ({ session: 'game', chats: [chat], acks: [1], connected: true });
  assert.equal(gate.next(view())?.rev, 101);
  for (let index = 0; index < 10000; index++) {
    assert.equal(applyEvent(chat, { type: 'content.delta', data: { kind: 'reasoning', delta: 'private' } }, parts), false);
    assert.equal(gate.next(view()), null);
  }
  const call = { type: 'call.requested', data: { callId: 'tool', capability: { kind: 'tool', name: 'inspect_target', label: 'Inspecting target' } } };
  assert.equal(applyEvent(chat, call, parts), true); assert.equal(gate.next(view())?.rev, 102);
  assert.equal(applyEvent(chat, { type: 'call.progress', data: { callId: 'tool', label: 'Inspecting target' } }, parts), false);
  assert.equal(gate.next(view()), null);
  assert.equal(applyEvent(chat, { type: 'call.settled', data: { callId: 'tool', outcome: 'completed' } }, parts), true);
  assert.equal(gate.next(view())?.rev, 103);
  assert.equal(applyEvent(chat, { type: 'call.settled', data: { callId: 'tool', outcome: 'completed' } }, parts), false);
  gate.invalidate(); assert.equal(gate.next(view())?.rev, 104, 'a failed disk write must remain retryable');
});

test('cached positive sound signals consume zero idle slots, back off on duplicates, and wake on a new user action', () => {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const run = (code: string) => { if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tolstring(L, -1))); };
  run(`now=0; loads=0; packets={}; timers={}; C={session='game',rev=0,SLOTS=1024,chats={{status='idle'}},active='chat'};
    function time() return 123 end; function GetTime() return now end;
    Enum={CompressionMethod={Zlib=1}}; C_EncodingUtil={SerializeJSON=function(packet) packets[#packets+1]=packet; return '{}' end,CompressString=function(text) return text end};
    C_Timer={NewTicker=function(seconds,fn) timers[seconds]=fn; return {Cancel=function() end} end};
    C_AddOns={DoesAddOnExist=function() return true end,EnableAddOn=function() end,DisableAddOn=function() end,SaveAddOns=function() end,
      LoadAddOn=function() loads=loads+1; if nextRev then C.rev=nextRev; nextRev=nil; C.Acknowledge({1}) end; return true end};
    function PlaySoundFile() return true,1 end; function StopSound() end`);
  run(`assert(load(${JSON.stringify(readFileSync('addon/WispAI/Transport.lua', 'utf8'))}))('WispAI',C); C.StartTransport(); C.Send({type='hello'}); nextRev=1; timers[.5](); assert(loads==1); for index=1,7200 do now=now+.5; if index%120==0 then timers[60]() end; timers[.5]() end; assert(loads==1 and C.slot==2,'cached sound positives and an hour of heartbeats must consume zero idle channels')`);
  run(`C.chats[1].status='working'; local before=loads; for index=1,240 do now=now+.5; timers[.5]() end; assert(loads-before<24,'duplicate payloads must back off, not burn two slots per second'); local before=loads; C.Send({type='say',text='new message'}); nextRev=2; timers[.5](); assert(loads==before+1 and C.rev==2,'new actions must bypass the backoff immediately')`);
});
