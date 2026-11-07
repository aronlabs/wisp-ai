import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ReplyStream } from '../src/reply-stream.ts';
import { selectionValues } from '../src/ui-schema.ts';
const require=createRequire(import.meta.url);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
test('UI stream upserts stable components and rejects cycles, invalid inputs and executable actions',()=>{
 const r=new ReplyStream();
 const node=(value:unknown)=>r.feed(JSON.stringify({type:'ui_node',node:value})+'\n');
 node({id:'card',kind:'card',title:'Comparison'}); node({id:'stat',parent:'card',kind:'stat',label:'Armor',value:'12'}); node({id:'stat',parent:'card',kind:'stat',label:'Armor',value:'15'});
 assert.equal(r.ui.length,2); assert.equal(r.ui[1].kind==='stat'&&r.ui[1].value,'15');
 node({id:'card',parent:'stat',kind:'card'}); node({id:'bad',kind:'button',label:'Bad',action:{kind:'lua',code:'x=1'}}); node({id:'slider',kind:'slider',min:5,max:1,step:1,value:2,label:'Bad'});
 assert.equal(r.ui.length,2); assert.equal(r.errors.length,3);
 node({id:'choice',parent:'card',kind:'select',label:'Pick',value:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]});
 assert.deepEqual({...selectionValues(r.ui,{choice:'b',unknown:'ignored'})},{choice:'b'});
 assert.throws(()=>selectionValues(r.ui,{choice:'unregistered'}));
 r.feed('{"type":"ui_node","node":{"id":"continue","kind":"button","label":"Continue","action":{"kind":"ask","prompt":"Continue"}}} trailing garbage\n');
 assert.equal(r.ui.at(-1)?.kind,'button','a complete valid button should survive trailing model noise');
});
test('native components preserve local edits across snapshots and dispatch registered button IDs',()=>{
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const run=(s:string)=>{if(lauxlib.luaL_dostring(L,to_luastring(s))!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)))};
 run(readFileSync('tests/wow-ui-stub.lua','utf8'));
 run(`C={db={},workStarted={}}; function C.Capture() return {fresh=true} end; function C.Send(packet) sent=packet end; function C.FormatText(t) return t end; chat={id='chat',status='done'}; message={id='reply',ui={{id='panel',kind='card',title='Choices'},{id='toggle',parent='panel',kind='toggle',label='Show',value=true},{id='select',parent='panel',kind='select',label='Mode',value='a',options={{value='a',label='A'},{value='b',label='B'}}},{id='button',parent='panel',kind='button',label='Continue',action={kind='ask',prompt='Continue'}}}}; host=CreateFrame('Frame')`);
 run(`assert(load(${JSON.stringify(readFileSync('addon/WispAI/RichUI.lua','utf8'))}))('WispAI',C)`);
 run(`local height=C.RenderRichUI(host,chat,message,350); assert(height>60); local toggle=host.widgets.toggle.control; toggle:SetChecked(false); toggle.scripts.OnClick(toggle); local select=host.widgets.select.control; select.scripts.OnClick(); assert(host.values.select=='b'); local count=#UI_TEST.widgets; C.RenderRichUI(host,chat,message,350); assert(#UI_TEST.widgets==count and host.values.toggle==false and host.values.select=='b' and not toggle:GetChecked(),'snapshots must preserve edits and widgets'); host.widgets.button.control.scripts.OnClick(); assert(sent.type=='ui_action' and sent.chat=='chat' and sent.messageId=='reply' and sent.nodeId=='button' and sent.values.toggle==false and sent.context.fresh); assert(chat.status=='working'); C.RenderRichUI(host,chat,message,350); assert(not host.widgets.button.control.enabled)`);
});
test('saved panels preserve controls after reload and can regroup or replace nodes',()=>{
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const run=(s:string)=>{if(lauxlib.luaL_dostring(L,to_luastring(s))!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)))};
 run(readFileSync('tests/wow-ui-stub.lua','utf8'));run(`C={};host=CreateFrame('Frame');host.values={choice=false};host.sourceValues={choice=true};chat={status='idle'};message={ui={{id='root',kind='column'},{id='choice',parent='root',kind='toggle',label='Enabled',value=true}}}`);
 run(`assert(load(${JSON.stringify(readFileSync('addon/WispAI/RichUI.lua','utf8'))}))('WispAI',C)`);
 run(`C.RenderRichUI(host,chat,message,300);assert(not host.widgets.choice.control:GetChecked(),'saved choice must survive widget creation');message.ui={{id='root',kind='column'},{id='group',parent='root',kind='card'},{id='choice',parent='group',kind='toggle',label='Enabled',value=true}};C.RenderRichUI(host,chat,message,300);assert(host.widgets.choice:GetParent()==host.widgets.group and not host.widgets.choice.control:GetChecked());local old=host.widgets.choice;message.ui[3]={id='choice',parent='group',kind='stat',label='State',value='Updated'};C.RenderRichUI(host,chat,message,300);assert(host.widgets.choice~=old and not old:IsShown() and host.widgets.choice.nodeKind=='stat')`);
});
