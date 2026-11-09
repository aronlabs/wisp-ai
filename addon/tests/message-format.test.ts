import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

test('emoji images preserve complete sequences, formatting, localized text and native links', () => {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(state, to_luastring(code)) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tolstring(state, -1)));
    }
  };
  run('C = {}');
  for (const file of ['EmojiData.lua', 'Emoji.lua', 'MessageFormat.lua']) {
    run(
      `assert(load(${JSON.stringify(readFileSync('addon/WispAI/' + file, 'utf8'))}))('WispAI', C)`,
    );
  }
  run(`
    function image(text)
      local rendered = C.Emoji.render(text)
      local _, count = rendered:gsub('|T', '')
      assert(count == 1 and rendered:sub(-2) == '|t', 'Expected one image: ' .. text .. ' => ' .. rendered)
      return rendered
    end
    for _, emoji in ipairs({'😄', '😎', '👍🏽', '✅️', '⚠️', '🧙‍♀️', '👨‍👩‍👧‍👦', '🇦🇷', '1️⃣', '#️⃣', '🏳️‍🌈', '👩🏽‍💻', '🫩'}) do image(emoji) end
    assert(C.Emoji.render('❤') == C.Emoji.render('❤️'))
    assert(C.FormatText('te pueden pegar a vos 😄') == 'te pueden pegar a vos ' .. image('😄'))
    local localized = 'maná, pingüino, ¿qué? — 你好 Привет 123 # * ©'
    assert(C.FormatText(localized) == localized)
    local link = '|Hitem:100|h[Espada]|h'
    assert(C.FormatText(link, nil, true) == link)
    local ref = C.FormatText('**[[ref:s]]**', {s={kind='spell',id=100,label='Fuego 🔥'}})
    assert(ref:find('|Hspell:100|h[Fuego ' .. image('🔥') .. ']|h', 1, true))
    local future = C.Emoji.render('😀‍😀')
    assert(future == '[emoji U+1F600]', 'unknown combinations must not split into partial images')
    assert(C.Emoji.render('☀︎') == '☀', 'explicit text presentation must be respected')
    local count = 0
    for emoji, index in pairs(C.EmojiData) do
      assert(index >= 0 and index < 4009)
      if #emoji > 2 then image(emoji) end
      count = count + 1
    end
    assert(count > 3900, 'the complete catalog must ship')
  `);
});

test('every catalog entry points inside a shipped uncompressed RGBA atlas', () => {
  const data = readFileSync('addon/WispAI/EmojiData.lua', 'utf8');
  const indices = [...data.matchAll(/ = (\d+),/g)].map((match) => Number(match[1]));
  expect(indices).toHaveLength(4009);
  for (let page = 0; page < 4; page++) {
    const atlas = readFileSync(`addon/WispAI/Textures/Emoji/Emoji${page}.tga`);
    expect(atlas[2]).toBe(2);
    expect(atlas.readUInt16LE(12)).toBe(1024);
    expect(atlas.readUInt16LE(14)).toBe(1024);
    expect(atlas[16]).toBe(32);
    expect(atlas.length).toBe(18 + 1024 * 1024 * 4);
    for (const index of indices.filter((index) => Math.floor(index / 1024) === page)) {
      const cell = index % 1024;
      let visible = false;
      for (let dy = 1; dy <= 30 && !visible; dy++) {
        for (let dx = 1; dx <= 30; dx++) {
          const x = (cell % 32) * 32 + dx;
          const y = Math.floor(cell / 32) * 32 + dy;
          if (atlas[18 + ((1023 - y) * 1024 + x) * 4 + 3] > 0) {
            visible = true;
            break;
          }
        }
      }
      expect(visible, `empty emoji cell ${index}`).toBe(true);
    }
  }
});
