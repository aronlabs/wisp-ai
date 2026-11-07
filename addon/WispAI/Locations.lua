local _, C = ...

local function finite(value)
    return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

function C.FindNPCLocations(args)
    local db = LibQuestieDB
    assert(
        db and db.flavor and db.flavor.expansion == "Forever",
        "QuestieDB Forever is not loaded; another game version cannot be used"
    )
    assert(
        db.RequireContract and db.RequireContract(4),
        "A compatible QuestieDB contract is required"
    )
    local npc = db.Npc
    assert(npc and npc.Get and npc.Exists, "QuestieDB NPC reads are unavailable")
    local zoneDB, townsfolk
    if QuestieLoader and QuestieLoader.ImportModule then
        local ok, value = pcall(QuestieLoader.ImportModule, QuestieLoader, "ZoneDB")
        if ok then
            zoneDB = value
        end
        ok, value = pcall(QuestieLoader.ImportModule, QuestieLoader, "Townsfolk")
        if ok then
            townsfolk = value
        end
    end
    local mapId = args.mapId or C_Map.GetBestMapForUnit("player")
    local map = mapId and C_Map.GetMapInfo(mapId)
    assert(map, "Resolve a native UI map ID with inspect_map first")
    local ids
    if args.mode == "class_trainers" then
        assert(
            Questie and Questie.IsForever and townsfolk and townsfolk.GetClassTrainers,
            "Questie's Forever class-trainer index is unavailable"
        )
        local _, class = UnitClass("player")
        ids = townsfolk.GetClassTrainers()[args.class or class] or {}
    elseif args.npcId then
        ids = { args.npcId }
    elseif args.name and npc.IdsByName then
        ids = npc.IdsByName(args.name) or {}
    else
        error("Provide an exact localized NPC name, an NPC ID, or class_trainers mode")
    end
    local limit = math.min(10, math.max(1, args.limit or 5))
    local locations, skippedFrames, unmatchedMaps = {}, 0, 0
    local faction = UnitFactionGroup("player") == "Horde" and "H" or "A"
    for _, id in ipairs(ids) do
        if npc.Exists(id) then
            local friendly = npc.Get(id, "friendlyToFaction")
            if not friendly or friendly:find(faction, 1, true) then
                local name = npc.Get(id, "name")
                local subName = npc.Get(id, "subName")
                local spawns = npc.Get(id, "spawns") or {}
                for areaId, points in pairs(spawns) do
                    local nativeId
                    if zoneDB and zoneDB.GetUiMapIdByAreaId and zoneDB.GetAreaIdByUiMapId then
                        local candidate = zoneDB:GetUiMapIdByAreaId(areaId)
                        if
                            candidate
                            and C_Map.GetMapInfo(candidate)
                            and zoneDB:GetAreaIdByUiMapId(candidate) == areaId
                        then
                            nativeId = candidate
                        end
                    elseif C_Map.GetAreaInfo and C_Map.GetAreaInfo(areaId) == map.name then
                        nativeId = mapId
                    end
                    if nativeId == mapId then
                        for _, point in ipairs(points) do
                            local x, y = point[1], point[2]
                            if
                                finite(x)
                                and finite(y)
                                and x >= 0
                                and x <= 100
                                and y >= 0
                                and y <= 100
                            then
                                local frameKnown = false
                                if db.EraToForever then
                                    local projectedX, projectedY = db.EraToForever(areaId, x, y)
                                    -- A non-identity projection needs per-record frame provenance.
                                    -- Never guess whether a composed point has already been projected.
                                    frameKnown = finite(projectedX)
                                        and finite(projectedY)
                                        and math.abs(projectedX - x) < 0.01
                                        and math.abs(projectedY - y) < 0.01
                                end
                                if frameKnown then
                                    locations[#locations + 1] = {
                                        npcId = id,
                                        name = name,
                                        subName = subName,
                                        mapId = mapId,
                                        zone = map.name,
                                        areaId = areaId,
                                        x = x,
                                        y = y,
                                        phase = point[3],
                                        provenance = db.GetProvenance
                                            and db.GetProvenance("Npc", id, "spawns"),
                                        reference = {
                                            kind = "map",
                                            mapId = mapId,
                                            x = x,
                                            y = y,
                                            label = name or tostring(id),
                                            source = "QuestieDB Forever",
                                        },
                                    }
                                else
                                    skippedFrames = skippedFrames + 1
                                end
                            end
                        end
                    elseif not nativeId then
                        unmatchedMaps = unmatchedMaps + 1
                    end
                end
            end
        end
    end
    table.sort(locations, function(a, b)
        if a.npcId ~= b.npcId then
            return a.npcId < b.npcId
        end
        if a.x ~= b.x then
            return a.x < b.x
        end
        return a.y < b.y
    end)
    local total = #locations
    while #locations > limit do
        table.remove(locations)
    end
    return {
        status = total > 0 and "available" or "no_matches",
        version = "forever",
        source = {
            name = "QuestieDB Forever",
            url = "https://github.com/Questie/QuestieDB",
            contract = db.contractVersion,
        },
        mapId = mapId,
        zone = map.name,
        locations = locations,
        total = total,
        truncated = total > limit,
        skippedUnverifiedFrames = skippedFrames,
        unmappedAreas = unmatchedMaps,
        note = "Database spawn positions, not live NPC sightings or guaranteed active phases. Coordinates are percentages on the verified native map. Missing coverage is unknown, not absence. No waypoint was placed.",
    }
end
