import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

for (const surface of ['main', 'inline']) {
  test(`${surface} groups chronological tool calls and text under one assistant header per turn`, () => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    const run = (code: string) => {
      if (lauxlib.luaL_dostring(state, to_luastring(code)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tolstring(state, -1)));
      }
    };
    run(readFileSync('tests/wow-ui-stub.lua', 'utf8'));
    run('C = {}; SlashCmdList = {}; function time() return 1 end');
    for (const file of ['Core.lua', 'RichUI.lua', 'UI.lua', 'Inline.lua']) {
      run(
        `assert(load(${JSON.stringify(readFileSync(`addon/WispAI/${file}`, 'utf8'))}))('WispAI', C)`,
      );
    }
    run(`
      C.db = {sidebar = true, showTools = true, drafts = {}}
      C.active = 'chat'
      C.connected = true
      C.chats = {{id = 'chat', title = 'Test', status = 'working', activity = {}, messages = {
        {id = 'u1', role = 'user', text = 'First question'},
        {id = 't1', role = 'tool', text = 'Reading spells', tool = {label = 'Reading spells', status = 'completed'}},
        {id = 'a1', role = 'assistant', text = 'Checking gear'},
        {id = 't2', role = 'tool', text = 'Reading gear', tool = {label = 'Reading gear', status = 'running'}},
        {id = 'a2', role = 'assistant', text = 'Final answer'},
        {id = 'u2', role = 'user', text = 'Second question'},
        {id = 't3', role = 'tool', text = 'Reading quests', tool = {label = 'Reading quests', status = 'completed'}},
        {id = 'a3', role = 'assistant', text = 'Second answer'},
      }}}
      C.BuildUI()
      C.InitInline()
      surface = '${surface}'
      if surface == 'inline' then
        C.inlineId = 'chat'
        UI_TEST.frames.WispAIInline:Show()
      end
      function refresh()
        if surface == 'main' then C.Refresh() else C.RefreshInline() end
      end
      function visibleRows()
        local result = {}
        for _, widget in ipairs(UI_TEST.widgets) do
          if type(widget.author) == 'table' and type(widget.text) == 'table' and widget:IsShown() then
            local main = widget.parent == UI_TEST.frames.WispAIProgress.parent
            if main == (surface == 'main') then
              result[#result + 1] = widget
            end
          end
        end
        return result
      end
      function findRow(text)
        for _, row in ipairs(visibleRows()) do
          if row.text:GetText():find(text, 1, true) then return row end
        end
        error('Missing message: ' .. text)
      end
      refresh()
      local first = findRow('Reading spells')
      assert(first.author:IsShown() and first.author:GetText() == 'Wisp AI')
      local _, _, _, _, textTop = first.text:GetPoint()
      assert(textTop == -20, 'the first tool must be below the assistant name')
      for _, text in ipairs({'Checking gear', 'Reading gear', 'Final answer', 'Second answer'}) do
        assert(not findRow(text).author:IsShown(), 'continuations must share the assistant header')
      end
      assert(findRow('Reading quests').author:IsShown(), 'a new user turn needs a new assistant header')
      local previous = 1
      for _, text in ipairs({'First question', 'Reading spells', 'Checking gear', 'Reading gear', 'Final answer', 'Second question', 'Reading quests', 'Second answer'}) do
        local _, _, _, _, top = findRow(text):GetPoint()
        assert(top < previous, 'message chronology must be preserved')
        previous = top
      end
      if surface == 'main' then
        assert(not UI_TEST.frames.WispAIProgress.author:IsShown(), 'progress continues the same assistant section')
        assert(UI_TEST.frames.WispAIProgress:GetHeight() == 34)
      end
      C.db.showTools = false
      refresh()
      assert(findRow('Checking gear').author:IsShown(), 'hiding tools must move the header onto visible text')
      assert(findRow('Second answer').author:IsShown())
      C.db.showTools = true
      refresh()
      assert(findRow('Reading spells').author:IsShown())
      assert(not findRow('Checking gear').author:IsShown())
      local writes = UI_TEST.textWrites
      refresh()
      assert(UI_TEST.textWrites == writes, 'unchanged groups must not rewrite rows')
    `);
  });
}
