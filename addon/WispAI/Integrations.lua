-- Integration discovery sends capabilities, never a copy of addon data.
local _, C = ...
local function version(name)
    local get = C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata
    return get and tostring(get(name, "Version") or "unknown"):sub(1, 80) or "unknown"
end
function C.IntegrationReport()
    local db = LibQuestieDB
    local status, trainers, services = "missing", false, false
    if db then
        status = "incompatible"
        local ok, compatible = pcall(function()
            return db.flavor
                and db.flavor.expansion == "Forever"
                and db.RequireContract
                and db.RequireContract(4)
                and db.Npc
                and type(db.Npc.Get) == "function"
                and type(db.Npc.Exists) == "function"
        end)
        if ok and compatible then
            status = "partial"
            if Questie and Questie.IsForever and QuestieLoader and QuestieLoader.ImportModule then
                local loaded, townsfolk =
                    pcall(QuestieLoader.ImportModule, QuestieLoader, "Townsfolk")
                if loaded and townsfolk then
                    trainers = type(townsfolk.GetClassTrainers) == "function"
                    services = type(townsfolk.townsfolk) == "table"
                end
            end
            if trainers and services then
                status = "ready"
            end
        end
    end
    return {
        version = version("WispAI"),
        questie = {
            status = status,
            version = db and version("QuestieDB") or nil,
            trainers = trainers,
            services = services,
        },
    }
end
