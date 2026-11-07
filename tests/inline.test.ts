import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resumeChat } from '../src/sessions.ts';
const require=createRequire(import.meta.url);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
function vm() {
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const run=(s:string)=>{if(lauxlib.luaL_dostring(L,to_luastring(s))!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)))};
 run(readFileSync('tests/wow-ui-stub.lua','utf8'));
 run(`C={}; SlashCmdList={}; function time() return 1 end`);
 for(const file of ['Core.lua','RichUI.lua','UI.lua','Inline.lua'])run(`assert(load(${JSON.stringify(readFileSync('addon/WispAI/'+file,'utf8'))}))('WispAI',C)`);
 run(`C.db={sidebar=true,minimized=true,showTools=true,drafts={}}; C.connected=true; C.active='main'; C.chats={{id='main',title='Main',messages={},status='idle',activity={}}}; packets={}; function C.Send(p) packets[#packets+1]=p end; function C.Acknowledge() end; function C.Log(t) notice=t end; function C.Capture(sections) return {fresh=true,sections=sections} end; C_EncodingUtil={DeserializeJSON=function(t) return t end}; C.BuildUI(); C.InitInline(); GameTooltip.GetItem=function() return 'Robe','|cff00ff00|Hitem:100:0|h[Robe]|h|r' end; GameTooltip:Show()`);
 return {run};
}
test('hover shortcut opens an inline query without switching or expanding the main chat, survives stale snapshots, and promotes on demand',()=>{
 vm().run(`C.OpenInline(); assert(C.active=='main' and C.db.minimized and C.inlineId==nil); local input=UI_TEST.frames.WispAIInlineInput; input:SetText('Is this good?'); C.SendInline(); local id=C.inlineId; local packet=packets[#packets]; assert(packet.type=='inline_say' and packet.chat==id and packet.text:find('|Hitem:100:0',1,true) and packet.context.fresh and C.active=='main'); assert(#C.InlineCurrent().messages==1 and C.InlineCurrent().status=='working'); WispAI_Receive({v=1,session=C.session,rev=1,connected=true,chats={{id='main',title='Main',messages={},status='idle'}}}); assert(C.InlineCurrent() and C.InlineCurrent().messages[1].text==packet.text,'stale snapshots must retain the optimistic inline message'); local quick=C.InlineCurrent(); quick.status='done'; quick.messages[2]={id='answer',role='assistant',text='Yes',ui={{id='card',kind='card',title='Equipment'},{id='armor',parent='card',kind='stat',label='Armor',value='12'}}}; C.RefreshInline(); assert(UI_TEST.frames.WispAIInline:IsShown()); local expand; for _,w in ipairs(UI_TEST.widgets) do if w:GetText()=='Expand' then expand=w end end; expand.scripts.OnClick(); assert(C.active==id and not C.db.minimized and not quick.inline and not UI_TEST.frames.WispAIInline:IsShown()); local found=false; for _,p in ipairs(packets) do if p.type=='promote_inline' and p.chat==id then found=true end end; assert(found)`);
});
test('reference capture supports spells and units and binding setup preserves existing shortcuts',()=>{
 vm().run(`GameTooltip.GetItem=function() end; GameTooltip.GetSpell=function() return 'Nova',122 end; assert(C.CaptureHover():find('spell:122',1,true)); GameTooltip.GetSpell=function() end; GameTooltip.GetUnit=function() return 'Wolf','mouseover' end; function UnitGUID(unit) assert(unit=='mouseover'); return 'Creature-0-1-2-3-4-5' end; assert(C.CaptureHover():find('unit:Creature-',1,true)); bindings={['CTRL-Q']='OTHER_ACTION'}; function GetBindingAction(key) return bindings[key] or '' end; function GetBindingKey() return 'CTRL-J' end; function SetBinding(key,value) bindings[key]=value; return true end; function SaveBindings() saved=true end; function GetCurrentBindingSet() return 1 end; function IsControlKeyDown() return true end; function IsAltKeyDown() return false end; C.BindInline(); local dialog; for _,w in ipairs(UI_TEST.widgets) do if w.scripts.OnKeyDown and w~=UI_TEST.frames.WispAIWindow then dialog=w end end; dialog.scripts.OnKeyDown(dialog,'Q'); assert(bindings['CTRL-Q']=='OTHER_ACTION' and not saved); dialog.scripts.OnKeyDown(dialog,'H'); assert(saved and bindings['CTRL-H']=='WISPAI_INLINE' and C.db.inlineBinding=='CTRL-H' and not dialog:IsShown())`);
});
test('automatic login/resume never selects an inline conversation',()=>{
 const main={id:'main',owner:'game',title:'Main',status:'done',messages:[{role:'user' as const,text:'Hi'}],activity:[],lastUsedAt:1};
 const inline={...main,id:'inline',inline:true,lastUsedAt:100};
 assert.equal(resumeChat([main,inline],'inline')?.id,'main'); assert.equal(resumeChat([inline]),undefined);
});
