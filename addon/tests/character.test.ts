import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function vm() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lauxlib.luaL_dostring(
    L,
    to_luastring(
      `CreateFrame=function() return {RegisterEvent=function() end,SetScript=function() end} end`,
    ),
  );
  return {
    run(code: string) {
      const status = lauxlib.luaL_dostring(L, to_luastring(code));
      if (status !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tolstring(L, -1)));
      }
    },
  };
}
const file = 'addon/WispAI/Character.lua';
function talentVM() {
  const v = vm();
  v.run(`
C = {}
function UnitName()
    return "Testmage"
end
function time()
    return 123
end
free = 2
pending = true
C_SpecializationInfo = {
    GetActiveSpecGroup = function()
        return 1
    end,
    GetCombatConfigIDForSpecGroup = function(group)
        assert(group == 1)
        return 55
    end,
}
C_Spell = {
    GetSpellName = function()
        return "Improved Frostbolt"
    end,
}
C_Traits = {
    GetConfigInfo = function()
        return { treeIDs = { 10, 20 } }
    end,
    ConfigHasStagedChanges = function()
        return pending
    end,
    GetTreeNodes = function(tree)
        return tree == 10 and { 1 } or {}
    end,
    GetNodeInfo = function()
        return { activeRank = 3, maxRanks = 5, activeEntry = { entryID = 2 }, groupIDs = { 999, 42 } }
    end,
    GetEntryInfo = function()
        return { definitionID = 3 }
    end,
    GetDefinitionInfo = function()
        return { spellID = 11070 }
    end,
    GetGroupDisplayInfoByTreeID = function()
        return { { groupID = 42, displayName = "Frost" } }
    end,
    GetTreeCurrencyInfo = function(config, tree, exclude)
        assert(config == 55)
        return {
            {
                traitCurrencyID = 3820,
                quantity = exclude and free or 0,
                spent = exclude and 3 or 5,
                maxQuantity = 5,
            },
        }
    end,
}
`);
  v.run(`assert(load(${JSON.stringify(readFileSync(file, 'utf8'))}))('WispAI',C)`);
  return v;
}

test('talent points use the applied API count, distinguish previews, and deduplicate shared pools', () => {
  const v = talentVM();
  v.run(
    `
local t = C.Capture({ "talents" }).sections.talents
assert(t.status == "available")
local d = t.data
assert(
    d.unspentStatus == "known"
        and d.unspentPoints == 2
        and d.spentPoints == 3
        and d.totalPoints == 5
)
assert(#d.currencies == 1, "a pool shared by trees must not be added twice")
assert(d.hasPendingChanges and d.previewUnspentPoints == 0)
assert(d.selected[1].rank == 3 and d.selected[1].maxRank == 5 and d.selected[1].branch == "Frost")
free = 0
pending = false
d = C.Capture({ "talents" }).sections.talents.data
assert(d.unspentStatus == "known" and d.unspentPoints == 0, "zero is a valid fresh reading")
assert(d.previewUnspentPoints == nil)
`,
  );
});

test('failed or ambiguous talent currencies remain unknown while selected talents stay available', () => {
  const v = talentVM();
  v.run(
    `
C_Traits.GetTreeCurrencyInfo = function()
    error("not ready")
end
local d = C.Capture({ "talents" }).sections.talents.data
assert(d.unspentStatus == "unknown" and d.unspentPoints == nil and #d.selected == 1)
C_Traits.GetTreeCurrencyInfo = function(config, tree)
    return { { traitCurrencyID = tree, quantity = 1, spent = 0, maxQuantity = 1 } }
end
d = C.Capture({ "talents" }).sections.talents.data
assert(d.unspentStatus == "unknown" and d.unspentPoints == nil and #d.currencies == 2)
C_Traits.GetTreeCurrencyInfo = function()
    return {}
end
d = C.Capture({ "talents" }).sections.talents.data
assert(d.unspentStatus == "unknown" and d.unspentPoints == nil)
`,
  );
});
test('all addon source files compile as Lua', () => {
  for (const name of readdirSync('addon/WispAI').filter((n) => n.endsWith('.lua'))) {
    const L = lauxlib.luaL_newstate();
    const result = lauxlib.luaL_loadstring(
      L,
      to_luastring(readFileSync('addon/WispAI/' + name, 'utf8')),
    );
    assert.equal(
      result,
      lua.LUA_OK,
      name + ': ' + (result ? to_jsstring(lua.lua_tolstring(L, -1)) : ''),
    );
  }
});
test('character sections are read only on demand and every call is fresh', () => {
  const v = vm();
  v.run(
    `
C = {}
calls = 0
currentLevel = 10
function UnitName()
    return "Testmage"
end
function time()
    return 123
end
function UnitLevel()
    calls = calls + 1
    return currentLevel
end
function UnitClass()
    return "Mage", "MAGE"
end
function UnitRace()
    return "Orc"
end
function UnitFactionGroup()
    return "Horde"
end
function GetRealmName()
    return "Realm"
end
function GetBuildInfo()
    return "1.60.1", "70840"
end
function GetMoney()
    return 123
end
function UnitXP()
    return 1
end
function UnitXPMax()
    return 100
end
`,
  );
  v.run(`assert(load(${JSON.stringify(readFileSync(file, 'utf8'))}))('WispAI',C)`);
  v.run(
    `
assert(calls == 0)
local s = C.Capture({ "character" })
assert(s.sections.character.data.level == 10)
assert(calls == 1)
currentLevel = 11
local t = C.Capture({ "character" })
assert(t.sections.character.data.level == 11)
assert(calls == 2)
`,
  );
});
test('known spells are returned and missing talent APIs stay unknown, never zero', () => {
  const v = vm();
  v.run(
    `
C = {}
function UnitName()
    return "Testmage"
end
function time()
    return 123
end
Enum = { SpellBookSpellBank = { Player = 0 }, SpellBookItemType = { Spell = 1 } }
C_SpellBook = {
    GetNumSpellBookSkillLines = function()
        return 1
    end,
    GetSpellBookSkillLineInfo = function()
        return { itemIndexOffset = 0, numSpellBookItems = 1 }
    end,
    GetSpellBookItemInfo = function()
        return { spellID = 122, name = "Frost Nova", itemType = 1, subName = "Rank 1" }
    end,
}
`,
  );
  v.run(`assert(load(${JSON.stringify(readFileSync(file, 'utf8'))}))('WispAI',C)`);
  v.run(
    `
local s = C.Capture({ "spells", "talents" })
assert(s.sections.spells.data.known[1].id == 122)
assert(s.sections.spells.data.known[1].name == "Frost Nova")
assert(s.sections.talents.status == "unavailable")
assert(s.sections.talents.data == nil)
`,
  );
});
test('an older bridge snapshot cannot erase an optimistic message', () => {
  const v = vm();
  v.run(
    `
C = {}
function time()
    return 123
end
function GetTime()
    return 5
end
CreateFrame = function()
    return { RegisterEvent = function() end, SetScript = function() end }
end
SlashCmdList = {}
C_EncodingUtil = {
    DeserializeJSON = function()
        return SNAPSHOT
    end,
}
`,
  );
  v.run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Core.lua', 'utf8'))}))('WispAI',C)`,
  );
  v.run(
    `
C.db = { drafts = {} }
C.Refresh = function() end
C.Send = function(p)
    SENT = p
end
C.Acknowledge = function() end
C.active = "chat"
C.chats = { { id = "chat", title = "test", status = "idle", messages = {} } }
C.draft = {
    GetText = function()
        return "hello"
    end,
    SetText = function() end,
}
C.Submit()
local id = SENT.messageId
assert(C.Current().messages[1].text == "hello")
SNAPSHOT = { v = 1, session = C.session, rev = 1, chats = {
    { id = "chat", title = "test", status = "idle", messages = {} },
} }
WispAI_Receive("")
assert(C.Current().messages[1].text == "hello")
assert(C.pendingMessages[id])
SNAPSHOT = {
    v = 1,
    session = C.session,
    rev = 2,
    chats = {
        { id = "chat", title = "test", status = "working", messages = {
            { id = id, role = "user", text = "hello" },
        } },
    },
}
WispAI_Receive("")
assert(#C.Current().messages == 1)
assert(C.pendingMessages[id] == nil)
`,
  );
});

test('each sent message captures only character and location automatically', () => {
  const v = vm();
  v.run(
    `
C = {}
function time()
    return 123
end
function GetTime()
    return 5
end
CreateFrame = function()
    return { RegisterEvent = function() end, SetScript = function() end }
end
SlashCmdList = {}
`,
  );
  v.run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Core.lua', 'utf8'))}))('WispAI',C)`,
  );
  v.run(
    `
C.db = { drafts = {} }
C.Refresh = function() end
C.active = "chat"
C.chats = { { id = "chat", title = "test", status = "idle", messages = {} } }
C.draft = {
    GetText = function()
        return "hello"
    end,
    SetText = function() end,
}
local captures = 0
C.Capture = function(sections)
    captures = captures + 1
    assert(#sections == 2 and sections[1] == "character" and sections[2] == "location")
    return { capturedAt = captures }
end
C.Send = function(packet)
    SENT = packet
end
C.Submit()
assert(captures == 1 and SENT.context.capturedAt == 1)
C.Current().status = "done"
C.Submit()
assert(captures == 2 and SENT.context.capturedAt == 2, "a new turn must carry a new snapshot")
`,
  );
});
test('deleted conversations stay removed when an older snapshot arrives', () => {
  const v = vm();
  v.run(
    `
C = {}
function time()
    return 123
end
function GetTime()
    return 5
end
CreateFrame = function()
    return { RegisterEvent = function() end, SetScript = function() end }
end
SlashCmdList = {}
C_EncodingUtil = {
    DeserializeJSON = function()
        return SNAPSHOT
    end,
}
`,
  );
  v.run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Core.lua', 'utf8'))}))('WispAI',C)`,
  );
  v.run(
    `
C.db = { drafts = { a = "draft" } }
C.Refresh = function() end
C.Send = function(p)
    SENT = p
end
C.Acknowledge = function() end
C.active = "a"
C.chats =
    { { id = "a", messages = {}, status = "idle" }, { id = "b", messages = {}, status = "idle" } }
C.DeleteChat("a")
assert(C.active == "b")
assert(C.db.drafts.a == nil)
assert(SENT.type == "delete" and SENT.chat == "a" and SENT.nextChat == "b")
SNAPSHOT =
    { v = 1, session = C.session, rev = 1, activeChat = "a", chats = {
        { id = "a", messages = {} },
        { id = "b", messages = {} },
    } }
WispAI_Receive("")
assert(#C.chats == 1 and C.chats[1].id == "b")
assert(C.active == "b")
`,
  );
});

test('capability toggles preserve their pending state until the matching bridge acknowledgement', () => {
  const v = vm();
  v.run(
    `
C = {}
function time()
    return 123
end
function GetTime()
    return 5
end
SlashCmdList = {}
C_EncodingUtil = {
    DeserializeJSON = function()
        return SNAPSHOT
    end,
}
`,
  );
  v.run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Core.lua', 'utf8'))}))('WispAI',C)`,
  );
  v.run(
    `
C.db = { drafts = {} }
C.Send = function(packet)
    SENT = packet
end
C.Acknowledge = function() end
C.SetCapability("tool:inspect_target", false)
local id = SENT.requestId
assert(SENT.type == "capability_set" and SENT.enabled == false)
SNAPSHOT = {
    v = 1,
    session = C.session,
    rev = 1,
    capabilities = { entries = { { id = "tool:inspect_target", enabled = true } }, acks = {} },
}
WispAI_Receive("")
assert(
    C.capabilityPending["tool:inspect_target"].enabled == false,
    "a stale authoritative checkbox must not undo a pending toggle"
)
SNAPSHOT = {
    v = 1,
    session = C.session,
    rev = 2,
    capabilities = {
        entries = { { id = "tool:inspect_target", enabled = false } },
        acks = { ["tool:inspect_target"] = id },
    },
}
WispAI_Receive("")
assert(C.capabilityPending["tool:inspect_target"] == nil and C.capabilities[1].enabled == false)
C.SetCapability("tool:inspect_target", true)
SNAPSHOT = {
    v = 1,
    session = C.session,
    rev = 3,
    capabilities = {
        entries = { { id = "tool:inspect_target", enabled = false } },
        error = { requestId = SENT.requestId, message = "Save failed" },
    },
}
WispAI_Receive("")
assert(C.capabilityPending["tool:inspect_target"] == nil and C.capabilityError == "Save failed")
`,
  );
});

test('repeated action delivery executes once and returns its result through the reliable outbox', () => {
  const v = vm();
  v.run(
    `
C = {}
function time()
    return 123
end
function GetTime()
    return 5
end
SlashCmdList = {}
C_EncodingUtil = {
    DeserializeJSON = function()
        return SNAPSHOT
    end,
}
`,
  );
  v.run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Core.lua', 'utf8'))}))('WispAI',C)`,
  );
  v.run(
    `
C.db = { drafts = {} }
C.Send = function(packet)
    SENT = packet
end
C.Acknowledge = function() end
local calls = 0
C.PerformAction = function(action)
    calls = calls + 1
    return { status = "completed" }
end
SNAPSHOT = {
    v = 1,
    session = C.session,
    rev = 1,
    requests = { { id = "action-1", chat = "chat", action = { kind = "create_macro", args = {} } } },
}
WispAI_Receive("")
assert(calls == 1 and SENT.type == "state_result" and SENT.data.status == "completed")
SNAPSHOT.rev = 2
WispAI_Receive("")
assert(calls == 1, "transport replay must never repeat a mutation")
`,
  );
});
