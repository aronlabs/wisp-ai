import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { inspectionSchema } from '../src/game-inspection.ts';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
function vm() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run(
    `
C = {}
function time()
    return 123
end
function UnitName(unit)
    return unit == "npc" and "Trainer" or "Mage"
end
function GetMoney()
    return 500
end
CreateFrame = function()
    return { RegisterEvent = function() end, SetScript = function() end }
end
`,
  );
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Character.lua', 'utf8'))}))('WispAI',C)`,
  );
  return { run };
}
test('reference reads distinguish loading from a missing item and expose real tooltip text', () => {
  vm().run(
    `
local requested
C_Item = {
    GetItemInfo = function(id)
        if id == 1 then
            return "Robe", "item:1", 2, 10, 5, "Armor", "Cloth", 1, "INVTYPE_ROBE", 0, 40
        end
    end,
    RequestLoadItemDataByID = function(id)
        requested = id
    end,
    GetItemStats = function()
        return { INT = 2 }
    end,
}
C_TooltipInfo = {
    GetHyperlink = function()
        return { lines = { { leftText = "Requires Level 5" } } }
    end,
}
local r = C.Inspect({ kind = "reference", args = { kind = "item", id = 1 } })
assert(
    r.status == "available"
        and r.data.requiredLevel == 5
        and r.data.tooltip[1].left == "Requires Level 5"
)
r = C.Inspect({ kind = "reference", args = { kind = "item", id = 2 } })
assert(r.data.status == "loading" and requested == 2)
assert(C.Inspect({ kind = "reference", args = { kind = "spell", id = 3 } }).status == "unavailable")
`,
  );
});
test('progression preserves false completion separately from unavailable data', () => {
  vm().run(
    `
C_QuestLog = {
    GetNumQuestLogEntries = function()
        return 0
    end,
    IsQuestFlaggedCompleted = function(id)
        if id == 3 then
            error("unknown")
        end
        return id == 1
    end,
}
local d =
    C.Inspect({ kind = "progression", args = { questIds = { 1, 2, 3 }, factionIds = { 10 } } }).data
assert(d.completion[1].completed == true)
assert(d.completion[2].completed == false and d.completion[2].status == "available")
assert(d.completion[3].status == "unavailable" and d.completion[3].completed == nil)
assert(d.reputations[1].status == "unavailable")
`,
  );
});
test('trainer reads require an open window and use the Forever service return fields', () => {
  vm().run(
    `
assert(C.Inspect({ kind = "trainer" }).status == "unavailable")
ClassTrainerFrame = {
    IsShown = function()
        return true
    end,
}
GetNumTrainerServices = function()
    return 1
end
GetTrainerServiceInfo = function()
    return "Frost Nova", "available", 123, 10, "Rank 1", "Frost"
end
GetTrainerServiceCost = function()
    return 200
end
BuyTrainerService = function()
    error("must not train")
end
local d = C.Inspect({ kind = "trainer" }).data
assert(
    d.services[1].requiredLevel == 10
        and d.services[1].rank == "Rank 1"
        and d.services[1].costCopper == 200
        and d.services[1].status == "available"
)
`,
  );
});
test('resource reads report collapsed skills and never turn unavailable bag space into zero', () => {
  vm().run(
    `
NUM_BAG_SLOTS = 1
C_Container = {
    GetContainerNumSlots = function()
        return 2
    end,
    GetContainerItemInfo = function()
        return nil
    end,
}
C_SkillInfo = {
    GetNumSkillLines = function()
        return 2
    end,
    GetSkillLineInfo = function(i)
        if i == 1 then
            return { isHeader = true, isCollapsed = true }
        else
            return { name = "Tailoring", skillID = 197, rank = 10, maxRank = 75 }
        end
    end,
}
local d = C.Inspect({ kind = "resources" }).data
assert(d.moneyCopper == 500 and d.bagCapacity == 4 and d.freeBagSlots == nil and d.collapsedSkills)
assert(d.skills[1].rank == 10 and d.skillsStatus == "available")
`,
  );
});
test('comparison considers both ring slots without converting raw deltas to DPS', () => {
  vm().run(
    `
C_Item = {
    GetItemInfo = function(id)
        return "Ring", "item:" .. id, 2, 10, 5, "Armor", "Ring", 1, "INVTYPE_FINGER", 0, 40
    end,
    GetItemStats = function(link)
        return { INT = tonumber(link:match(":(%d+)")) }
    end,
}
GetInventoryItemID = function(unit, slot)
    return slot == 11 and 1 or 2
end
local d = C.Inspect({ kind = "compare_items", args = { itemIds = { 5 } } }).data
assert(#d.candidates[1].comparisons == 2)
assert(
    d.candidates[1].comparisons[1].statDelta.INT == 4
        and d.candidates[1].comparisons[2].statDelta.INT == 3
)
`,
  );
});
test('auction reads require the AH, keep stack/unit prices separate, and expose partial coverage', () => {
  vm().run(
    `
assert(C.Inspect({ kind = "auctions" }).status == "unavailable")
AuctionFrame = {
    IsShown = function()
        return true
    end,
}
GetRealmName = function()
    return "Realm"
end
UnitFactionGroup = function()
    return "Horde"
end
GetNumAuctionItems = function()
    return 1, 200
end
GetAuctionItemInfo = function()
    return "Cloth", 0, 20, 1, true, 1, 0, 100, 1, 1000, 0, false, 0, "Seller", nil, 0, 2589
end
QueryAuctionItems = function()
    error("must not scan")
end
PlaceAuctionBid = function()
    error("must not buy")
end
local d = C.Inspect({ kind = "auctions", args = { itemId = 2589 } }).data
assert(
    d.partial
        and d.totalSearchResults == 200
        and d.results[1].unitBuyoutCopper == 50
        and d.results[1].buyoutCopper == 1000
)
local other = C.Inspect({ kind = "auctions", args = { itemId = 999 } }).data
assert(#other.results == 0 and other.partial)
`,
  );
});
test('inspection RPC accepts bounded read-only requests and rejects arbitrary commands', () => {
  assert.equal(inspectionSchema.parse({ kind: 'target', args: {} }).kind, 'target');
  assert.equal(
    inspectionSchema.parse({ kind: 'reference', args: { kind: 'quest', id: 12 } }).kind,
    'reference',
  );
  assert.throws(() => inspectionSchema.parse({ kind: 'purchase', args: {} }));
  assert.throws(() =>
    inspectionSchema.parse({ kind: 'progression', args: { questIds: Array(41).fill(1) } }),
  );
  assert.throws(() =>
    inspectionSchema.parse({ kind: 'reference', args: { kind: 'item', id: -1 } }),
  );
});
test('target inspection uses the selected NPC identity and does not fabricate coordinates', () => {
  vm().run(
    `
UnitExists = function()
    return true
end
UnitGUID = function()
    return "Creature-0-1-2-3-456-abc"
end
strsplit = function(_, text)
    local parts = {}
    for part in text:gmatch("[^-]+") do
        parts[#parts + 1] = part
    end
    return table.unpack(parts)
end
UnitLevel = function()
    return 11
end
UnitClassification = function()
    return "normal"
end
UnitIsPlayer = function()
    return false
end
UnitFactionGroup = function()
    return "Horde"
end
UnitReaction = function()
    return 3
end
UnitCanAttack = function()
    return true
end
UnitIsDead = function()
    return false
end
local d = C.Inspect({ kind = "target" }).data
assert(d.npcId == 456 and d.level == 11 and d.attackable and d.x == nil)
UnitExists = function()
    return false
end
assert(C.Inspect({ kind = "target" }).status == "unavailable")
`,
  );
});
test('modern auction browse output stays labelled as cached partial data', () => {
  vm().run(
    `
AuctionHouseFrame = {
    IsShown = function()
        return true
    end,
}
GetRealmName = function()
    return "Realm"
end
UnitFactionGroup = function()
    return "Horde"
end
C_AuctionHouse = {
    GetBrowseResults = function()
        return { { itemKey = { itemID = 2589 }, minPrice = 50, totalQuantity = 200 } }
    end,
    SendBrowseQuery = function()
        error("must not search")
    end,
}
local d = C.Inspect({ kind = "auctions", args = { itemId = 2589, limit = 1 } }).data
assert(
    d.partial
        and d.loadedResults == 1
        and d.results[1].minimumPriceCopper == 50
        and d.results[1].totalQuantity == 200
        and d.pricesAsOf:find("unknown")
)
`,
  );
});
