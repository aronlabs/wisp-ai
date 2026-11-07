local _, C = ...
local GOLD, TEXT, MUTED = { 0.84, 0.72, 0.43 }, { 0.89, 0.85, 0.75 }, { 0.64, 0.60, 0.51 }
local function label(parent, text, tint)
    local font = parent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    font:SetText(text)
    font:SetTextColor(unpack(tint or TEXT))
    font:SetJustifyH("LEFT")
    return font
end
local function setText(font, value)
    if font._wispText ~= value then
        font._wispText = value
        font:SetText(value)
    end
end
local function box(frame, bg, edge)
    frame:SetBackdrop({
        bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile = true,
        tileSize = 16,
        edgeSize = edge or 12,
        insets = { left = 3, right = 3, top = 3, bottom = 3 },
    })
    frame:SetBackdropColor(unpack(bg))
    frame:SetBackdropBorderColor(0.43, 0.38, 0.28, 1)
end
local function button(parent, text, width, click)
    local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
    b:SetSize(width, 24)
    b:SetText(text)
    b:SetScript("OnClick", click)
    return b
end
local referenceQuests = {}
local function mapLocation(link)
    local id, x, y = link:match("^worldmap:(%d+):(%d+):(%d+)$")
    id, x, y = tonumber(id), tonumber(x), tonumber(y)
    if id and id > 0 and x and x <= 10000 and y and y <= 10000 then
        return id, x / 100, y / 100
    end
end
local function refreshReferences()
    if not C_QuestLog or not C_QuestLog.GetNumQuestLogEntries then
        return
    end
    C.db.questReferences = C.db.questReferences or {}
    local changed = false
    for index = 1, C_QuestLog.GetNumQuestLogEntries() do
        local info = C_QuestLog.GetInfo(index)
        if info and not info.isHeader and info.questID and info.title then
            local old = C.db.questReferences[tostring(info.questID)]
            if not old or old.title ~= info.title or old.level ~= info.level then
                changed = true
            end
            C.db.questReferences[tostring(info.questID)] =
                { id = info.questID, title = info.title, level = info.level }
        end
    end
    referenceQuests = C.db.questReferences
    return changed
end
local function macroNameFromLink(link)
    local hex = link:match("^wispmacro:([%x]+)$")
    if not hex or #hex > 32 or #hex % 2 ~= 0 then
        return nil
    end
    local name = hex:gsub("..", function(pair)
        return string.char(tonumber(pair, 16))
    end)
    if name:find("[%c|]") then
        return nil
    end
    return name
end
local function formatted(text, references, fromUser)
    local links = {}
    local function keep(link)
        links[#links + 1] = link
        return "\1" .. #links .. "\2"
    end
    text = tostring(text or "")
    text = text:gsub("```.-```", function(code)
        return keep(code:gsub("|", "||"))
    end)
    text = text:gsub("`[^`\n]+`", function(code)
        return keep(code:gsub("|", "||"))
    end)
    if fromUser then
        text = text:gsub("|c%x%x%x%x%x%x%x%x|H[^|]+|h.-|h|r", keep)
        text = text:gsub("|H[^|]+|h.-|h", keep)
    end
    text = text:gsub("|", "||")
    text = text:gsub("%[%[ref:([%w_-]+)%]%]", function(key)
        local ref = references and references[key]
        if type(ref) ~= "table" then
            return "(reference unavailable)"
        end
        local name = tostring(ref.label or "Reference"):gsub("[|%c%[%]]", "")
        local payload
        if ref.kind == "item" or ref.kind == "spell" or ref.kind == "quest" then
            local id = tonumber(ref.id)
            if not id or id < 1 then
                return name
            end
            payload = ref.kind .. ":" .. id
            if
                type(ref.payload) == "string"
                and (ref.payload == payload or ref.payload:sub(1, #payload + 1) == payload .. ":")
                and ref.payload:match("^" .. ref.kind .. ":[%d:%+%.%-]+$")
            then
                payload = ref.payload
            end
        elseif
            ref.kind == "unit"
            and type(ref.guid) == "string"
            and ref.guid:match("^%a+%-%w[%w%-]*$")
        then
            payload = "unit:" .. ref.guid
        elseif ref.kind == "map" then
            local id, x, y = tonumber(ref.mapId), tonumber(ref.x), tonumber(ref.y)
            if not id or id < 1 then
                return name
            end
            if x and y and x >= 0 and x <= 100 and y >= 0 and y <= 100 then
                payload = string.format(
                    "worldmap:%d:%d:%d",
                    id,
                    math.floor(x * 100 + 0.5),
                    math.floor(y * 100 + 0.5)
                )
                name = name .. string.format(" (%.1f, %.1f)", x, y)
            else
                payload = "wispzone:" .. id
            end
        elseif
            ref.kind == "macro"
            and type(ref.name) == "string"
            and #ref.name <= 16
            and not ref.name:find("[%c|]")
        then
            payload = "wispmacro:"
                .. ref.name:gsub(".", function(char)
                    return string.format("%02x", string.byte(char))
                end)
        end
        if not payload then
            return name
        end
        return keep("|cffe3c77e|H" .. payload .. "|h[" .. name .. "]|h|r")
    end)
    text = text:gsub("%*%*([^*]+)%*%*", "|cffe3c77e%1|r")
    text = text:gsub("%*([^*\n]+)%*", "%1"):gsub("_([^_\n]+)_", "%1")
    text = text:gsub("%[([^%]]+)%]%(https?://[^%)]+%)", "%1")
    return (text:gsub("\1(%d+)\2", function(index)
        return links[tonumber(index)]
    end))
end
C.FormatText = formatted
local function referenceSignature(references)
    local parts = {}
    for key, ref in pairs(references or {}) do
        local values = {}
        for field, value in pairs(ref) do
            values[#values + 1] = field .. "=" .. tostring(value)
        end
        table.sort(values)
        parts[#parts + 1] = key .. ":" .. table.concat(values, "\30")
    end
    table.sort(parts)
    return table.concat(parts, "\31")
end
local frame, header, body, sidebar, chatPanel, status, transcript, content, scrollBar, sessionTitle, send, mini, settings, contextMeter
local replyGlow
local emptyState
local progress
local gear, fold, sessionsLabel, newSession, resize
local memoryPanel, memoryContent, memoryStatus
local memoryRows = {}
local capabilityPanel, capabilityContent, capabilityStatus, capabilityScroll
local capabilityRows, capabilityTabs = {}, {}
local capabilityGroup = "tools"
function C.RefreshCapabilities()
    if not capabilityPanel then
        return
    end
    local pending, values = C.capabilityPending or {}, {}
    for _, entry in ipairs(C.capabilities or {}) do
        local value = entry.enabled
        if pending[entry.id] then
            value = pending[entry.id].enabled
        end
        values[entry.id] = value
    end
    setText(
        capabilityStatus,
        C.capabilityError
            or (
                not C.capabilities and "Waiting for bridge..."
                or (
                    next(pending) and "Saving changes..."
                    or "New calls use these settings. Running calls may finish."
                )
            )
    )
    for group, tab in pairs(capabilityTabs) do
        tab:SetAlpha(group == capabilityGroup and 1 or 0.6)
    end
    local y, used = 0, {}
    for _, entry in ipairs(C.capabilities or {}) do
        if entry.group == capabilityGroup then
            local row = capabilityRows[entry.id]
            if not row then
                row = CreateFrame("Frame", nil, capabilityContent)
                capabilityRows[entry.id] = row
                row:SetHeight(32)
                row.check = CreateFrame("CheckButton", nil, row, "UICheckButtonTemplate")
                row.check:SetSize(26, 26)
                row.check:SetPoint("LEFT", 0, 0)
                row.text = label(row, "")
                row.text:SetPoint("LEFT", row.check, "RIGHT", 3, 0)
                row.text:SetPoint("RIGHT", -70, 0)
                row.text:SetWordWrap(false)
                row.state = label(row, "", MUTED)
                row.state:SetPoint("RIGHT", -2, 0)
                row.check:SetScript("OnClick", function(self)
                    C.SetCapability(row.entry.id, self:GetChecked())
                end)
                row:EnableMouse(true)
                local function showHelp(self)
                    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                    GameTooltip:SetText(row.entry.name)
                    GameTooltip:AddLine(row.entry.description, 0.85, 0.82, 0.75, true)
                    GameTooltip:Show()
                end
                row:SetScript("OnEnter", showHelp)
                row.check:SetScript("OnEnter", showHelp)
                row:SetScript("OnLeave", function()
                    GameTooltip:Hide()
                end)
                row.check:SetScript("OnLeave", function()
                    GameTooltip:Hide()
                end)
            end
            used[entry.id] = true
            row.entry = entry
            local blocked = entry.parent and values[entry.parent] == false
            local indent = entry.parent and 17 or 0
            row:SetWidth(math.max(210, capabilityPanel:GetWidth() - 65 - indent))
            row:ClearAllPoints()
            row:SetPoint("TOPLEFT", indent, -y)
            row.check:SetChecked(values[entry.id])
            row.check:SetEnabled(not blocked and not pending[entry.id])
            setText(row.text, entry.name)
            setText(
                row.state,
                pending[entry.id] and "Saving..."
                    or (blocked and "MCP off" or (values[entry.id] and "On" or "Off"))
            )
            row:SetAlpha(blocked and 0.45 or 1)
            row:Show()
            y = y + 33
        end
    end
    for id, row in pairs(capabilityRows) do
        if not used[id] and row:IsShown() then
            row:Hide()
        end
    end
    capabilityContent:SetHeight(math.max(1, y))
end
function C.RefreshMemory()
    if not memoryPanel then
        return
    end
    local memory = C.memory or { status = "loading" }
    setText(
        memoryStatus,
        memory.status == "loading" and "Loading memory..."
            or (
                memory.error
                or (
                    #(memory.entries or {}) == 0 and "No saved memories yet."
                    or "Preferences and this character's plans"
                )
            )
    )
    local y = 0
    for index, entry in ipairs(memory.entries or {}) do
        local row = memoryRows[index]
        if not row then
            row = CreateFrame("Frame", nil, memoryContent)
            memoryRows[index] = row
            row.text = label(row, "")
            row.text:SetFontObject(ChatFontNormal)
            row.text:SetWordWrap(true)
            row.text:SetPoint("TOPLEFT", 0, -2)
            row.scope = label(row, "", MUTED)
            row.scope:SetPoint("BOTTOMLEFT", 0, 3)
            row.edit = button(row, "Edit", 45, function()
                StaticPopup_Show("WISPAI_EDIT_MEMORY", nil, nil, row.entry)
            end)
            row.edit:SetPoint("BOTTOMRIGHT", -54, 0)
            row.remove = button(row, "Forget", 52, function()
                C.MemoryAction("remove", row.entry.slot, row.entry.key)
            end)
            row.remove:SetPoint("BOTTOMRIGHT", 0, 0)
        end
        row.entry = entry
        local width = math.max(220, memoryPanel:GetWidth() - 65)
        row:SetWidth(width)
        row.text:SetWidth(width)
        setText(row.text, entry.text:gsub("|", "||"))
        setText(row.scope, entry.slot == "preferences" and "Player" or "Character")
        local height = math.max(40, row.text:GetStringHeight()) + 35
        row:SetHeight(height)
        row:ClearAllPoints()
        row:SetPoint("TOPLEFT", 0, -y)
        row:Show()
        y = y + height + 12
    end
    for index = #(memory.entries or {}) + 1, #memoryRows do
        memoryRows[index]:Hide()
    end
    memoryContent:SetHeight(math.max(1, y))
end
C.workStarted = C.workStarted or {}
local function refreshProgress()
    local chat = C.Current()
    local working = chat and chat.status == "working"
    local empty = not chat or not chat.messages or #chat.messages == 0
    local waiting = not C.connected
    local loading = chat and chat.messages == nil
    emptyState:SetShown(empty and not working)
    emptyState.loading = waiting or loading
    if empty and not working then
        setText(
            emptyState.title,
            waiting and "Waiting for bridge" or (loading and "Loading conversation" or "Ask Wisp")
        )
        setText(
            emptyState.detail,
            waiting and "Keep the Wisp desktop app open. Your chat will appear when it connects."
                or (
                    loading and "Fetching your messages."
                    or "Ask about your character, quests, equipment or where to go next."
                )
        )
        for _, dot in ipairs(emptyState.dots) do
            dot:SetShown(emptyState.loading)
        end
    end
    progress:SetShown(working)
    local title = "Wisp AI"
    if working then
        local now = GetTime()
        C.workStarted[chat.id] = C.workStarted[chat.id] or now
        local seconds = math.max(0, math.floor(now - C.workStarted[chat.id]))
        local elapsed = seconds < 60 and (seconds .. "s")
            or string.format("%dm %02ds", math.floor(seconds / 60), seconds % 60)
        local sending = false
        for _, pending in pairs(C.pendingMessages or {}) do
            if pending.chat == chat.id then
                sending = true
                break
            end
        end
        local compacting = chat.usage and chat.usage.compacting
        local phase = sending and "Sending" or (compacting and "Compacting" or "Thinking")
        local dots = string.rep(".", math.floor(now * 2) % 3 + 1)
        setText(progress.elapsed, elapsed)
        local detail = sending
                and (seconds >= 15 and "Waiting for bridge confirmation" or "Delivering your message")
            or "Preparing your reply"
        if compacting then
            detail = "Summarizing older context to continue this conversation"
        end
        local activity
        if not sending and not compacting then
            for index = #(chat.activity or {}), 1, -1 do
                local tool = chat.activity[index]
                if tool.status == "running" then
                    activity = tool.label or tool.name
                    detail = activity
                    break
                end
            end
        end
        setText(progress.title, (activity or phase) .. dots)
        setText(progress.detail, detail)
        title = "Wisp AI - " .. phase .. " " .. elapsed
    elseif chat then
        C.workStarted[chat.id] = nil
    end
    setText(
        header.title,
        C.db.minimized and (C.unread and "Wisp AI - New reply" or title) or "Wisp AI"
    )
    replyGlow:SetShown(C.db.minimized and C.unread == true)
end
function C.SaveWindowPosition(minimized)
    local point, _, relativePoint, x, y = frame:GetPoint()
    local position = { point = point, relativePoint = relativePoint, x = x, y = y }
    if minimized then
        C.db.minimizedPosition = position
    else
        C.db.expandedPosition = position
    end
end
local function restorePosition(minimized)
    local p = (minimized and C.db.minimizedPosition)
        or C.db.expandedPosition
        or { point = C.db.point or "CENTER", x = C.db.x or 0, y = C.db.y or 0 }
    frame:ClearAllPoints()
    frame:SetPoint(p.point, UIParent, p.relativePoint or p.point, p.x or 0, p.y or 0)
end
function C.RequestDeleteChat(id)
    for _, chat in ipairs(C.chats) do
        if chat.id == id then
            StaticPopup_Show("WISPAI_DELETE_CHAT", chat.title, nil, id)
            return
        end
    end
end
local sessionContent, sessionScroll
local sessionButtons, rows, scrollPositions = {}, {}, {}
local renderedChat, itemRevision = nil, 0
local rendering, scrollRange = false, 0
local function layout()
    local expanded = not C.db.minimized
    gear:SetShown(expanded)
    fold:SetShown(expanded)
    resize:SetShown(expanded)
    sessionsLabel:SetShown(C.db.sidebar)
    newSession:SetShown(C.db.sidebar)
    sessionScroll:SetShown(C.db.sidebar)
    local width = C.db.sidebar and 155 or 30
    sidebar:SetWidth(width)
    local arrow = C.db.sidebar and "<" or ">"
    if fold.lastText ~= arrow then
        fold.lastText = arrow
        fold:SetText(arrow)
    end
    local titleAnchor = expanded and gear or mini
    if header.titleAnchor ~= titleAnchor then
        header.titleAnchor = titleAnchor
        header.title:ClearAllPoints()
        header.title:SetPoint("LEFT", 12, 0)
        header.title:SetPoint("RIGHT", titleAnchor, "LEFT", -8, 0)
    end
    if chatPanel._sidebarWidth ~= width then
        chatPanel._sidebarWidth = width
        chatPanel:ClearAllPoints()
        chatPanel:SetPoint("TOPLEFT", body, "TOPLEFT", width, 0)
        chatPanel:SetPoint("BOTTOMRIGHT", body, "BOTTOMRIGHT", 0, 0)
    end
end
local function linked(row)
    row:EnableMouse(true)
    row:SetHyperlinksEnabled(true)
    row:SetScript("OnHyperlinkEnter", function(self, link, text)
        C.hoverLink = text or ("|H" .. link .. "|h[Reference]|h")
        GameTooltip:SetOwner(self, "ANCHOR_CURSOR")
        local zone = tonumber(link:match("^wispzone:(%d+)$"))
        if zone then
            local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(zone)
            GameTooltip:SetText(info and info.name or "Map", 1, 0.82, 0)
            GameTooltip:AddLine("Click to open this map.", 0.65, 0.65, 0.65, true)
            GameTooltip:Show()
            return
        end
        local mapId, x, y = mapLocation(link)
        if mapId then
            local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapId)
            GameTooltip:SetText(info and info.name or "Map location", 1, 0.82, 0)
            GameTooltip:AddLine(string.format("%.2f, %.2f", x, y), 0.9, 0.87, 0.8)
            GameTooltip:AddLine("Click to view this location on the map.", 0.65, 0.65, 0.65, true)
            GameTooltip:Show()
            return
        end
        local macroName = macroNameFromLink(link)
        if macroName then
            local index = GetMacroIndexByName and GetMacroIndexByName(macroName)
            GameTooltip:SetText(macroName, 1, 0.82, 0)
            if index and index > 0 and GetMacroInfo then
                local _, _, code = GetMacroInfo(index)
                GameTooltip:AddLine((code or ""):gsub("|", "||"), 0.9, 0.87, 0.8, true)
                GameTooltip:AddLine(
                    "Click to pick up this macro, then place it on your action bar.",
                    0.65,
                    0.65,
                    0.65,
                    true
                )
            else
                GameTooltip:AddLine("This macro is no longer available.", 0.8, 0.5, 0.4, true)
            end
            GameTooltip:Show()
            return
        end
        local id = tonumber(link:match("^quest:(%d+)"))
        local quest = id and referenceQuests[tostring(id)]
        if quest then
            GameTooltip:SetText(quest.title, 1, 0.82, 0)
            if quest.level then
                GameTooltip:AddLine("Level " .. quest.level, 0.7, 0.7, 0.7)
            end
            local objectives = C_QuestLog.GetQuestObjectives and C_QuestLog.GetQuestObjectives(id)
                or {}
            for _, objective in ipairs(objectives) do
                GameTooltip:AddLine(
                    objective.text or "",
                    objective.finished and 0.4 or 1,
                    objective.finished and 1 or 0.85,
                    0.4,
                    true
                )
            end
            GameTooltip:AddLine("Click to view quest. Shift-click to link.", 0.65, 0.65, 0.65, true)
            GameTooltip:Show()
            return
        end
        if pcall(GameTooltip.SetHyperlink, GameTooltip, link) then
            GameTooltip:Show()
        end
    end)
    row:SetScript("OnHyperlinkLeave", function()
        C.hoverLink = nil
        GameTooltip:Hide()
    end)
    row:SetScript("OnHyperlinkClick", function(self, link, text, mouse)
        if IsShiftKeyDown() then
            C.draft:Insert(text)
            C.draft:SetFocus()
            return
        end
        local zone = tonumber(link:match("^wispzone:(%d+)$"))
        if zone then
            if C_Map and C_Map.OpenWorldMap then
                C_Map.OpenWorldMap(zone)
            else
                C.Log("The map UI is unavailable.")
            end
            return
        end
        local macroName = macroNameFromLink(link)
        if macroName then
            if InCombatLockdown and InCombatLockdown() then
                C.Log("Leave combat before picking up a macro.")
                return
            end
            local index = GetMacroIndexByName and GetMacroIndexByName(macroName)
            if index and index > 0 and PickupMacro then
                PickupMacro(index)
            else
                C.Log("This macro is no longer available.")
            end
            return
        end
        local id = tonumber(link:match("^quest:(%d+)"))
        if id and QuestMapFrame_OpenToQuestDetails then
            QuestMapFrame_OpenToQuestDetails(id)
        else
            SetItemRef(link, text, mouse, self)
        end
    end)
    row:EnableMouseWheel(true)
    row:SetScript("OnMouseWheel", function(_, delta)
        local parent = row
        while parent do
            local target = parent._wispScroll
            if target then
                target:SetVerticalScroll(
                    math.max(
                        0,
                        math.min(
                            target:GetVerticalScrollRange(),
                            target:GetVerticalScroll() - delta * 45
                        )
                    )
                )
                return
            end
            parent = parent:GetParent()
        end
        scrollBar:SetValue(math.max(0, math.min(scrollRange, scrollBar:GetValue() - delta * 45)))
    end)
end
C.LinkWidget = linked
local function makeRow(parent)
    local row = CreateFrame("Frame", nil, parent or content)
    linked(row)
    row.author = label(row, "", GOLD)
    row.author:SetPoint("TOPLEFT", 0, 0)
    row.text = label(row, "")
    row.text:SetFontObject(ChatFontNormal)
    row.text:SetWordWrap(true)
    row.icon = row:CreateTexture(nil, "ARTWORK")
    row.icon:SetSize(14, 14)
    row.icon:SetPoint("TOPLEFT", 0, -1)
    return row
end
C.MakeMessageRow = makeRow
function C.MessageSpeaker(message)
    return (message.role == "tool" or message.role == "assistant") and "assistant" or message.role
end
function C.RenderMessageRow(row, chat, message, width, showAuthor)
    local tool = message.tool
    local signature = (message.role or "")
        .. "\31"
        .. (message.text or "")
        .. "\31"
        .. (tool and tool.status or "")
        .. "\31"
        .. width
        .. "\31"
        .. itemRevision
        .. "\31"
        .. referenceSignature(message.references)
        .. "\31"
        .. (C.RichSignature and C.RichSignature(message.ui) or "")
        .. "\31"
        .. (chat.status or "")
        .. "\31"
        .. tostring(showAuthor)
    if row.signature ~= signature then
        row.signature = signature
        row:SetWidth(width)
        row.text:ClearAllPoints()
        local top = showAuthor and 20 or 0
        row.author:SetShown(showAuthor)
        setText(
            row.author,
            message.role == "user" and "You" or (message.role == "system" and "Notice" or "Wisp AI")
        )
        if message.role == "tool" then
            if row.rich then
                row.rich:Hide()
            end
            row.icon:ClearAllPoints()
            row.icon:SetPoint("TOPLEFT", 0, -top - 1)
            row.icon:Show()
            local state = tool and tool.status or "completed"
            row.icon:SetTexture(
                state == "completed" and "Interface\\RaidFrame\\ReadyCheck-Ready"
                    or (
                        state == "running" and "Interface\\RaidFrame\\ReadyCheck-Waiting"
                        or "Interface\\RaidFrame\\ReadyCheck-NotReady"
                    )
            )
            row.text:SetPoint("TOPLEFT", 21, -top)
            row.text:SetWidth(width - 21)
            row.text:SetTextColor(unpack(MUTED))
            local suffix = state == "running" and "  |cffe0c070Running|r"
                or (state == "completed" and "" or "  |cffd98575Failed|r")
            setText(row.text, formatted(tool and tool.label or message.text) .. suffix)
            row.height = top + math.max(18, row.text:GetStringHeight()) + 7
        else
            row.icon:Hide()
            row.text:SetPoint("TOPLEFT", 0, -top)
            row.text:SetWidth(width)
            row.text:SetTextColor(unpack(message.role == "system" and MUTED or TEXT))
            setText(row.text, formatted(message.text, message.references, message.role == "user"))
            row.height = top
                + math.max(1, message.text ~= "" and row.text:GetStringHeight() or 0)
                + 10
            if C.RenderRichUI then
                row.rich = row.rich or CreateFrame("Frame", nil, row)
                row.rich:Show()
                row.rich:ClearAllPoints()
                row.rich:SetPoint("TOPLEFT", 0, -row.height)
                row.height = row.height + C.RenderRichUI(row.rich, chat, message, width)
            end
            row.height = row.height + 8
        end
        row:SetHeight(row.height)
    end
end
local function renderTranscript(chat)
    local id = chat and chat.id or "empty"
    local switched = renderedChat ~= id
    local oldOffset = transcript:GetVerticalScroll()
    if switched and renderedChat then
        scrollPositions[renderedChat] =
            { offset = oldOffset, follow = scrollRange - oldOffset < 30 }
    end
    local follow = scrollRange - oldOffset < 30
    if switched then
        local saved = scrollPositions[id]
        oldOffset = saved and saved.offset or 0
        follow = not saved or saved.follow
    end
    local width = math.max(100, transcript:GetWidth() - 6)
    local y, used = 0, {}
    local previousSpeaker
    for index, message in ipairs(chat and chat.messages or {}) do
        if message.role ~= "tool" or C.db.showTools then
            local key = id .. ":" .. (message.id or tostring(index))
            local row = rows[key]
            if not row then
                row = makeRow()
                rows[key] = row
            end
            used[key] = true
            local speaker = C.MessageSpeaker(message)
            local showAuthor = speaker ~= "assistant" or previousSpeaker ~= speaker
            C.RenderMessageRow(row, chat, message, width, showAuthor)
            previousSpeaker = speaker
            if row.y ~= y then
                row.y = y
                row:ClearAllPoints()
                row:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -y)
            end
            if not row:IsShown() then
                row:Show()
            end
            y = y + row.height
        end
    end
    if chat and chat.status == "working" then
        local showAuthor = previousSpeaker ~= "assistant"
        if progress.showAuthor ~= showAuthor then
            progress.showAuthor = showAuthor
            progress.author:SetShown(showAuthor)
            progress:SetHeight(showAuthor and 54 or 34)
            progress.title:ClearAllPoints()
            progress.title:SetPoint("TOPLEFT", 0, showAuthor and -20 or 0)
            progress.title:SetPoint("RIGHT", -65, 0)
            progress.elapsed:ClearAllPoints()
            progress.elapsed:SetPoint("TOPRIGHT", -2, showAuthor and -20 or 0)
        end
        progress:SetWidth(width)
        if progress.y ~= y then
            progress.y = y
            progress:ClearAllPoints()
            progress:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -y)
        end
        y = y + progress:GetHeight()
    end
    for key, row in pairs(rows) do
        if not used[key] and row:IsShown() then
            row:Hide()
        end
    end
    content:SetWidth(width)
    content:SetHeight(math.max(1, y))
    scrollRange = math.max(0, y - transcript:GetHeight())
    scrollBar:SetMinMaxValues(0, math.max(1, scrollRange))
    scrollBar:EnableMouse(scrollRange > 0)
    scrollBar:SetAlpha(scrollRange > 0 and 1 or 0.35)
    local position = follow and scrollRange or math.min(oldOffset, scrollRange)
    scrollBar:SetValue(position)
    transcript:SetVerticalScroll(position)
    renderedChat = id
end
function C.SetMinimized(value)
    if not frame or value == C.db.minimized then
        return
    end
    C.SaveWindowPosition(C.db.minimized)
    if value and not C.db.minimizedPosition then
        local left, top = frame:GetLeft(), frame:GetTop()
        if left and top then
            C.db.minimizedPosition =
                { point = "TOPLEFT", relativePoint = "BOTTOMLEFT", x = left, y = top }
        end
    end
    C.db.minimized = value
    body:SetShown(not value)
    settings:Hide()
    if value then
        C.db.expandedWidth, C.db.expandedHeight = frame:GetWidth(), frame:GetHeight()
        if frame.SetResizeBounds then
            frame:SetResizeBounds(220, 36, 1000, 900)
        end
        frame:SetSize(220, 36)
        mini:SetText("+")
    else
        if frame.SetResizeBounds then
            frame:SetResizeBounds(430, 320, 1000, 900)
        end
        frame:SetSize(C.db.expandedWidth or 610, C.db.expandedHeight or 490)
        mini:SetText("-")
        C.unread = false
    end
    restorePosition(value)
    C.Refresh()
end
function C.Refresh()
    if not frame or rendering then
        return
    end
    rendering = true
    local chat = C.Current()
    setText(
        status,
        C.exhausted and "Channels exhausted: /reload"
            or (C.connected and "Connected" or "Waiting for bridge...")
    )
    refreshProgress()
    local usage = chat and chat.usage
    local window = C.contextPolicy and C.contextPolicy.windowTokens
    local measured = usage and usage.contextTokens
    local meterText = usage and usage.compacting and "Compacting..."
        or (measured and window and string.format("Context ~%.0f%%", measured / window * 100))
        or "Context --"
    setText(contextMeter.text, meterText)
    setText(sessionTitle, chat and chat.title or "New conversation")
    layout()
    local sessionCount = 0
    local used = {}
    local ordered, positions = {}, {}
    for index, session in ipairs(C.chats) do
        ordered[#ordered + 1] = session
        positions[session.id] = index
    end
    table.sort(ordered, function(a, b)
        local aTime, bTime = a.lastActivityAt or 0, b.lastActivityAt or 0
        if aTime == bTime then
            return positions[a.id] < positions[b.id]
        end
        return aTime > bTime
    end)
    for _, session in ipairs(ordered) do
        if not session.inline and not session.proactive then
            sessionCount = sessionCount + 1
            local index = sessionCount
            local b = sessionButtons[session.id]
            if not b then
                b = CreateFrame("Button", nil, sessionContent, "BackdropTemplate")
                b:SetSize(139, 42)
                b.title = label(b, "")
                b.title:SetPoint("TOPLEFT", 7, -7)
                b.title:SetPoint("RIGHT", -28, 0)
                b.title:SetWordWrap(false)
                b.info = label(b, "", MUTED)
                b.info:SetPoint("TOPLEFT", 7, -24)
                b:SetScript("OnClick", function(self)
                    C.Select(self.chatId)
                end)
                b:SetScript("OnEnter", function(self)
                    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                    GameTooltip:SetText(self.fullTitle)
                    GameTooltip:Show()
                end)
                b:SetScript("OnLeave", function()
                    GameTooltip:Hide()
                end)
                b.delete = button(b, "x", 20, function()
                    C.RequestDeleteChat(b.chatId)
                end)
                b.delete:SetSize(20, 20)
                b.delete:SetPoint("TOPRIGHT", -3, -3)
                b.delete:SetScript("OnEnter", function(self)
                    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                    GameTooltip:SetText("Delete conversation")
                    GameTooltip:Show()
                end)
                b.delete:SetScript("OnLeave", function()
                    GameTooltip:Hide()
                end)
                sessionButtons[session.id] = b
            end
            used[session.id] = true
            b.chatId, b.fullTitle = session.id, session.title
            if b.index ~= index then
                b.index = index
                b:ClearAllPoints()
                b:SetPoint("TOPLEFT", 0, -(index - 1) * 44)
            end
            setText(b.title, session.title)
            setText(
                b.info,
                session.status == "working" and "Working..."
                    or (session.unread and "Unread" or "Conversation")
            )
            local selected = session.id == C.active
            if b.selected ~= selected then
                b.selected = selected
                b.title:SetTextColor(unpack(selected and GOLD or TEXT))
                if selected then
                    box(b, { 0.25, 0.21, 0.14, 1 }, 8)
                else
                    b:SetBackdrop(nil)
                end
            end
            if not b:IsShown() then
                b:Show()
            end
        end
    end
    sessionContent:SetHeight(math.max(1, sessionCount * 44))
    for id, b in pairs(sessionButtons) do
        if not used[id] and b:IsShown() then
            b:Hide()
        end
    end
    renderTranscript(chat)
    local sendText = chat and chat.status == "working" and "Stop" or "Send"
    if send.lastText ~= sendText then
        send.lastText = sendText
        send:SetText(sendText)
    end
    rendering = false
    if C.RefreshInline then
        C.RefreshInline()
    end
end
function C.BuildUI()
    refreshReferences()
    StaticPopupDialogs.WISPAI_DELETE_CHAT = {
        text = 'Delete "%s"? This conversation will be removed.',
        button1 = "Delete",
        button2 = "Cancel",
        OnAccept = function(_, id)
            C.DeleteChat(id)
        end,
        timeout = 0,
        whileDead = true,
        hideOnEscape = true,
    }
    StaticPopupDialogs.WISPAI_EDIT_MEMORY = {
        text = "Edit saved memory",
        button1 = "Save",
        button2 = "Cancel",
        hasEditBox = true,
        maxLetters = 1000,
        OnShow = function(self, entry)
            local edit = self.GetEditBox and self:GetEditBox() or self.editBox
            edit:SetText(entry.text)
            edit:SetFocus()
        end,
        OnAccept = function(self, entry)
            local edit = self.GetEditBox and self:GetEditBox() or self.editBox
            C.MemoryAction("save", entry.slot, entry.key, edit:GetText())
        end,
        timeout = 0,
        whileDead = true,
        hideOnEscape = true,
    }
    frame = CreateFrame("Frame", "WispAIWindow", UIParent, "BackdropTemplate")
    frame:SetSize(C.db.expandedWidth or 610, C.db.expandedHeight or 490)
    restorePosition(false)
    frame:SetClampedToScreen(true)
    frame:SetMovable(true)
    frame:EnableMouse(true)
    frame:SetFrameStrata("DIALOG")
    frame:SetResizable(true)
    if frame.SetResizeBounds then
        frame:SetResizeBounds(430, 320, 1000, 900)
    end
    box(frame, { 0.075, 0.065, 0.05, 0.97 }, 16)
    header = CreateFrame("Frame", nil, frame)
    header:SetPoint("TOPLEFT", 5, -4)
    header:SetPoint("TOPRIGHT", -5, -4)
    header:SetHeight(30)
    header:EnableMouse(true)
    header:RegisterForDrag("LeftButton")
    header:SetScript("OnDragStart", function()
        frame:StartMoving()
    end)
    header:SetScript("OnDragStop", function()
        frame:StopMovingOrSizing()
        C.SaveWindowPosition(C.db.minimized)
    end)
    header.title = label(header, "Wisp AI", GOLD)
    header.title:SetPoint("LEFT", 12, 0)
    replyGlow = CreateFrame("Frame", "WispAIReplyGlow", header, "BackdropTemplate")
    replyGlow:SetPoint("TOPLEFT", frame, "TOPLEFT", -2, 2)
    replyGlow:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 2, -2)
    replyGlow:SetBackdrop({
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        edgeSize = 20,
    })
    replyGlow:SetBackdropBorderColor(1, 0.78, 0.28, 1)
    replyGlow:EnableMouse(false)
    replyGlow:Hide()
    mini = button(header, "-", 25, function()
        C.SetMinimized(not C.db.minimized)
    end)
    mini:SetPoint("RIGHT", -3, 0)
    gear = CreateFrame("Button", "WispAISettingsButton", header)
    gear:SetSize(24, 24)
    gear:SetPoint("RIGHT", mini, "LEFT", -4, 0)
    gear:SetNormalTexture("Interface\\AddOns\\WispAI\\Textures\\Gear.tga")
    gear:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
    gear:SetScript("OnClick", function()
        settings:SetShown(not settings:IsShown())
    end)
    gear:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_BOTTOM")
        GameTooltip:SetText("Settings")
        GameTooltip:Show()
    end)
    gear:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)
    header.title:SetWordWrap(false)
    body = CreateFrame("Frame", nil, frame)
    body:SetPoint("TOPLEFT", 6, -37)
    body:SetPoint("BOTTOMRIGHT", -6, 5)
    sidebar = CreateFrame("Frame", nil, body, "BackdropTemplate")
    sidebar:SetPoint("TOPLEFT")
    sidebar:SetPoint("BOTTOMLEFT")
    sidebar:SetWidth(155)
    box(sidebar, { 0.10, 0.085, 0.065, 1 }, 8)
    sessionsLabel = label(sidebar, "Sessions", GOLD)
    sessionsLabel:SetPoint("TOPLEFT", 11, -12)
    newSession = button(sidebar, "+", 25, function()
        C.NewChat()
    end)
    newSession:SetPoint("TOPRIGHT", -33, -6)
    fold = CreateFrame("Button", "WispAISidebarToggle", sidebar, "UIPanelButtonTemplate")
    fold:SetSize(22, 24)
    fold:SetPoint("TOPRIGHT", -5, -6)
    fold:SetScript("OnClick", function()
        C.db.sidebar = not C.db.sidebar
        C.Refresh()
    end)
    fold:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:SetText(C.db.sidebar and "Collapse sessions" or "Expand sessions")
        GameTooltip:Show()
    end)
    fold:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)
    sessionScroll = CreateFrame("ScrollFrame", nil, sidebar)
    sessionScroll:SetPoint("TOPLEFT", 7, -38)
    sessionScroll:SetPoint("BOTTOMRIGHT", -7, 8)
    sessionContent = CreateFrame("Frame", nil, sessionScroll)
    sessionContent:SetSize(139, 1)
    sessionScroll:SetScrollChild(sessionContent)
    sessionScroll:EnableMouseWheel(true)
    sessionScroll:SetScript("OnMouseWheel", function(self, delta)
        self:SetVerticalScroll(
            math.max(
                0,
                math.min(self:GetVerticalScrollRange(), self:GetVerticalScroll() - delta * 35)
            )
        )
    end)
    chatPanel = CreateFrame("Frame", nil, body)
    sessionTitle = label(chatPanel, "New conversation", MUTED)
    sessionTitle:SetPoint("TOPLEFT", 12, -9)
    sessionTitle:SetPoint("RIGHT", -12, 0)
    sessionTitle:SetWordWrap(false)
    transcript = CreateFrame("ScrollFrame", nil, chatPanel)
    transcript:SetPoint("TOPLEFT", 13, -34)
    transcript:SetPoint("BOTTOMRIGHT", -31, 104)
    content = CreateFrame("Frame", nil, transcript)
    content:SetSize(360, 1)
    transcript:SetScrollChild(content)
    emptyState = CreateFrame("Frame", "WispAIChatPlaceholder", chatPanel)
    emptyState:SetAllPoints(transcript)
    emptyState:EnableMouse(false)
    emptyState.title = label(emptyState, "", GOLD)
    emptyState.title:SetPoint("CENTER", 0, 20)
    emptyState.title:SetJustifyH("CENTER")
    emptyState.detail = label(emptyState, "", MUTED)
    emptyState.detail:SetPoint("TOP", emptyState.title, "BOTTOM", 0, -10)
    emptyState.detail:SetPoint("LEFT", 20, 0)
    emptyState.detail:SetPoint("RIGHT", -20, 0)
    emptyState.detail:SetJustifyH("CENTER")
    emptyState.detail:SetWordWrap(true)
    emptyState.dots = {}
    for index = 1, 3 do
        local dot = label(emptyState, ".", GOLD)
        dot:SetFontObject("GameFontNormalLarge")
        dot:SetPoint("BOTTOM", emptyState.title, "TOP", (index - 2) * 12, 12)
        emptyState.dots[index] = dot
    end
    scrollBar = CreateFrame("Slider", "WispAITranscriptScrollBar", chatPanel, "BackdropTemplate")
    scrollBar:SetOrientation("VERTICAL")
    scrollBar:SetPoint("TOPRIGHT", -10, -34)
    scrollBar:SetPoint("BOTTOMRIGHT", -10, 104)
    scrollBar:SetWidth(14)
    box(scrollBar, { 0.08, 0.07, 0.05, 1 }, 8)
    scrollBar:SetMinMaxValues(0, 1)
    scrollBar:SetValueStep(1)
    if scrollBar.SetObeyStepOnDrag then
        scrollBar:SetObeyStepOnDrag(false)
    end
    scrollBar:SetThumbTexture("Interface\\Buttons\\UI-ScrollBar-Knob")
    scrollBar:GetThumbTexture():SetSize(14, 28)
    scrollBar:SetScript("OnValueChanged", function(_, value)
        transcript:SetVerticalScroll(value)
    end)
    transcript:EnableMouseWheel(true)
    transcript:SetScript("OnMouseWheel", function(_, delta)
        scrollBar:SetValue(math.max(0, math.min(scrollRange, scrollBar:GetValue() - delta * 45)))
    end)
    local progressTick = 0
    frame:SetScript("OnUpdate", function(_, elapsed)
        if emptyState:IsShown() and emptyState.loading then
            for index, dot in ipairs(emptyState.dots) do
                dot:SetAlpha(0.3 + 0.7 * (0.5 + 0.5 * math.sin(GetTime() * 4 - index * 0.8)))
            end
        end
        if replyGlow:IsShown() then
            replyGlow:SetAlpha(0.65 + 0.25 * math.sin(GetTime() * math.pi))
        end
        progressTick = progressTick + elapsed
        if progressTick >= 0.25 then
            progressTick = 0
            refreshProgress()
        end
    end)
    local inputBox = CreateFrame("Frame", nil, chatPanel, "BackdropTemplate")
    inputBox:SetPoint("BOTTOMLEFT", 9, 22)
    inputBox:SetPoint("BOTTOMRIGHT", -9, 22)
    inputBox:SetHeight(78)
    box(inputBox, { 0.045, 0.04, 0.03, 1 }, 9)
    C.draft = CreateFrame("EditBox", "WispAIInput", inputBox)
    C.draft:SetMultiLine(true)
    C.draft:SetAutoFocus(false)
    C.draft:SetFontObject(ChatFontNormal)
    C.draft:SetMaxLetters(4000)
    C.draft:SetPoint("TOPLEFT", 10, -7)
    C.draft:SetPoint("BOTTOMRIGHT", -10, 28)
    C.draft:SetScript("OnEnterPressed", function(self)
        if IsShiftKeyDown() then
            self:Insert("\n")
        else
            C.Submit()
        end
    end)
    C.draft:SetScript("OnEscapePressed", function(self)
        self:ClearFocus()
        C.SetMinimized(true)
    end)
    local hint = label(inputBox, "Shift-click to link", MUTED)
    hint:SetPoint("BOTTOMLEFT", 10, 9)
    progress = CreateFrame("Frame", "WispAIProgress", content)
    progress:SetHeight(54)
    progress.author = label(progress, "Wisp AI", GOLD)
    progress.author:SetPoint("TOPLEFT", 0, 0)
    progress.title = label(progress, "", MUTED)
    progress.title:SetFontObject(ChatFontNormal)
    progress.title:SetPoint("TOPLEFT", 0, -20)
    progress.title:SetPoint("RIGHT", -65, 0)
    progress.title:SetWordWrap(false)
    progress.elapsed = label(progress, "", MUTED)
    progress.elapsed:SetPoint("TOPRIGHT", -2, -20)
    progress.detail = label(progress, "", MUTED)
    progress.detail:Hide()
    progress:EnableMouse(true)
    progress:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_TOP")
        GameTooltip:SetText(progress.detail:GetText())
        GameTooltip:Show()
    end)
    progress:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)
    send = button(inputBox, "Send", 75, function()
        local chat = C.Current()
        if chat and chat.status == "working" then
            C.Send({ type = "cancel", chat = C.active })
        else
            C.Submit()
        end
    end)
    send:SetPoint("BOTTOMRIGHT", -7, 5)
    status = label(chatPanel, "Waiting for bridge...", MUTED)
    status:SetPoint("BOTTOMLEFT", 12, 6)
    contextMeter = CreateFrame("Button", "WispAIContextUsage", chatPanel)
    contextMeter:SetSize(112, 16)
    contextMeter:SetPoint("BOTTOMRIGHT", -22, 3)
    contextMeter.text = label(contextMeter, "Context --", MUTED)
    contextMeter.text:SetAllPoints(contextMeter)
    contextMeter.text:SetJustifyH("RIGHT")
    contextMeter:SetScript("OnEnter", function(self)
        local chat = C.Current()
        local usage = chat and chat.usage
        local policy = C.contextPolicy or {}
        GameTooltip:SetOwner(self, "ANCHOR_TOP")
        GameTooltip:AddLine("Conversation context")
        if usage and usage.contextTokens then
            GameTooltip:AddLine(
                string.format("Last measured context: %d tokens", usage.contextTokens),
                1,
                1,
                1
            )
        else
            GameTooltip:AddLine("Context size not measured yet", 1, 1, 1)
        end
        if policy.windowTokens then
            GameTooltip:AddLine(
                string.format("Model capacity: %d tokens", policy.windowTokens),
                1,
                1,
                1
            )
        end
        if policy.compactAt then
            GameTooltip:AddLine(
                string.format(
                    "Auto compact: %.0f%% (includes summary overhead)",
                    policy.compactAt * 100
                ),
                1,
                1,
                1
            )
        end
        if usage then
            GameTooltip:AddLine(
                string.format(
                    "Observed input / output: %d / %d",
                    usage.inputTokens or 0,
                    usage.outputTokens or 0
                ),
                1,
                1,
                1
            )
            GameTooltip:AddLine(
                string.format(
                    "Cached input: %d | Compactions: %d",
                    usage.cacheReadTokens or 0,
                    usage.compactions or 0
                ),
                1,
                1,
                1
            )
        end
        GameTooltip:AddLine(
            "Context is approximate between model calls. Totals count repeated input and exclude separate search requests.",
            0.7,
            0.7,
            0.7,
            true
        )
        GameTooltip:AddLine(
            "This is conversation space, not your subscription allowance. Older context is summarized; chat messages stay visible.",
            0.7,
            0.7,
            0.7,
            true
        )
        GameTooltip:Show()
    end)
    contextMeter:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)
    resize = CreateFrame("Button", nil, frame)
    resize:SetSize(18, 18)
    resize:SetPoint("BOTTOMRIGHT")
    resize:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
    resize:SetScript("OnMouseDown", function()
        if not C.db.minimized then
            frame:StartSizing("BOTTOMRIGHT")
        end
    end)
    resize:SetScript("OnMouseUp", function()
        frame:StopMovingOrSizing()
        if not C.db.minimized then
            C.db.expandedWidth, C.db.expandedHeight = frame:GetWidth(), frame:GetHeight()
            C.SaveWindowPosition(false)
        end
        C.Refresh()
    end)
    settings = CreateFrame("Frame", nil, frame, "BackdropTemplate")
    settings:SetAllPoints(body)
    settings:SetFrameLevel(frame:GetFrameLevel() + 15)
    box(settings, { 0.10, 0.085, 0.065, 1 }, 12)
    settings:Hide()
    local title = label(settings, "Settings", GOLD)
    title:SetPoint("TOPLEFT", 20, -20)
    local sound = CreateFrame("CheckButton", nil, settings, "UICheckButtonTemplate")
    sound:SetPoint("TOPLEFT", 17, -50)
    sound:SetChecked(C.db.sound)
    sound:SetScript("OnClick", function(self)
        C.db.sound = self:GetChecked()
        if C.PlayCompletionSound then
            C.PlayCompletionSound()
        end
    end)
    local st = label(settings, "Completion sound")
    st:SetPoint("LEFT", sound, "RIGHT", 4, 0)
    local tools = CreateFrame("CheckButton", nil, settings, "UICheckButtonTemplate")
    tools:SetPoint("TOPLEFT", 17, -85)
    tools:SetChecked(C.db.showTools)
    tools:SetScript("OnClick", function(self)
        C.db.showTools = self:GetChecked()
        C.Refresh()
    end)
    local tt = label(settings, "Show tool activity in conversations")
    tt:SetPoint("LEFT", tools, "RIGHT", 4, 0)
    local capabilitiesButton = button(settings, "Tools & MCPs", 125, function()
        capabilityPanel:Show()
        C.Send({ type = "capabilities_list" })
        C.RefreshCapabilities()
    end)
    capabilitiesButton:SetPoint("TOPLEFT", 20, -120)
    local memoryButton = button(settings, "Memory", 90, function()
        memoryPanel:Show()
        C.MemoryAction("list")
    end)
    memoryButton:SetPoint("LEFT", capabilitiesButton, "RIGHT", 10, 0)
    local bind = button(settings, "Bind inline chat", 140, function()
        if C.BindInline then
            C.BindInline()
        end
    end)
    bind:SetPoint("TOPLEFT", 20, -155)
    local panelButton = button(settings, "Show saved panels", 155, function()
        if C.ShowPanels then
            C.ShowPanels()
        end
    end)
    panelButton:SetPoint("LEFT", bind, "RIGHT", 10, 0)
    local bindHint =
        label(settings, "Hover a reference and use your inline key. /wisp ask also works.", MUTED)
    bindHint:SetPoint("TOPLEFT", 20, -190)
    bindHint:SetPoint("RIGHT", -20, 0)
    bindHint:SetWordWrap(true)
    local back = button(settings, "Back", 90, function()
        settings:Hide()
    end)
    back:SetPoint("TOPLEFT", 20, -230)
    capabilityPanel = CreateFrame("Frame", "WispAICapabilitiesPanel", settings, "BackdropTemplate")
    capabilityPanel:SetAllPoints(settings)
    capabilityPanel:SetFrameLevel(settings:GetFrameLevel() + 5)
    box(capabilityPanel, { 0.10, 0.085, 0.065, 1 }, 12)
    capabilityPanel:Hide()
    local capabilityTitle = label(capabilityPanel, "Tools & MCPs", GOLD)
    capabilityTitle:SetPoint("TOPLEFT", 20, -15)
    for index, group in ipairs({ "tools", "mcps", "memory" }) do
        local tabGroup = group
        local tab = button(
            capabilityPanel,
            group == "mcps" and "MCPs" or (group == "memory" and "Memory" or "Tools"),
            85,
            function()
                capabilityGroup = tabGroup
                capabilityScroll:SetVerticalScroll(0)
                C.RefreshCapabilities()
            end
        )
        tab:SetPoint("TOPLEFT", 20 + (index - 1) * 92, -40)
        capabilityTabs[group] = tab
    end
    capabilityStatus = label(capabilityPanel, "", MUTED)
    capabilityStatus:SetPoint("TOPLEFT", 20, -73)
    capabilityStatus:SetPoint("RIGHT", -20, 0)
    capabilityStatus:SetWordWrap(true)
    capabilityScroll =
        CreateFrame("ScrollFrame", nil, capabilityPanel, "UIPanelScrollFrameTemplate")
    capabilityScroll:SetPoint("TOPLEFT", 20, -105)
    capabilityScroll:SetPoint("BOTTOMRIGHT", -35, 45)
    capabilityContent = CreateFrame("Frame", nil, capabilityScroll)
    capabilityContent:SetSize(400, 1)
    capabilityScroll:SetScrollChild(capabilityContent)
    local capabilityBack = button(capabilityPanel, "Back", 90, function()
        capabilityPanel:Hide()
    end)
    capabilityBack:SetPoint("BOTTOMLEFT", 20, 12)
    capabilityPanel:SetScript("OnSizeChanged", C.RefreshCapabilities)
    memoryPanel = CreateFrame("Frame", "WispAIMemoryPanel", settings, "BackdropTemplate")
    memoryPanel:SetAllPoints(settings)
    memoryPanel:SetFrameLevel(settings:GetFrameLevel() + 5)
    box(memoryPanel, { 0.10, 0.085, 0.065, 1 }, 12)
    memoryPanel:Hide()
    local memoryTitle = label(memoryPanel, "Memory", GOLD)
    memoryTitle:SetPoint("TOPLEFT", 20, -15)
    memoryStatus = label(memoryPanel, "", MUTED)
    memoryStatus:SetPoint("TOPLEFT", 20, -38)
    memoryStatus:SetPoint("RIGHT", -20, 0)
    memoryStatus:SetWordWrap(true)
    local memoryScroll = CreateFrame("ScrollFrame", nil, memoryPanel, "UIPanelScrollFrameTemplate")
    memoryScroll:SetPoint("TOPLEFT", 20, -75)
    memoryScroll:SetPoint("BOTTOMRIGHT", -35, 45)
    memoryContent = CreateFrame("Frame", nil, memoryScroll)
    memoryContent:SetSize(400, 1)
    memoryScroll:SetScrollChild(memoryContent)
    local memoryBack = button(memoryPanel, "Back", 90, function()
        memoryPanel:Hide()
    end)
    memoryBack:SetPoint("BOTTOMLEFT", 20, 12)
    memoryPanel:SetScript("OnSizeChanged", C.RefreshMemory)
    if ChatFrameUtil and ChatFrameUtil.InsertLink then
        hooksecurefunc(ChatFrameUtil, "InsertLink", function(link)
            if C.draft:HasFocus() then
                C.draft:Insert(link)
            end
        end)
    end
    local itemEvents = CreateFrame("Frame")
    itemEvents:RegisterEvent("GET_ITEM_INFO_RECEIVED")
    itemEvents:RegisterEvent("QUEST_LOG_UPDATE")
    itemEvents:SetScript("OnEvent", function(_, event)
        if event == "QUEST_LOG_UPDATE" and not refreshReferences() then
            return
        end
        itemRevision = itemRevision + 1
        C.Refresh()
    end)
    frame:EnableKeyboard(true)
    frame:SetPropagateKeyboardInput(true)
    frame:SetScript("OnKeyDown", function(self, key)
        if key == "ESCAPE" and C.CloseInline and C.CloseInline() then
            self:SetPropagateKeyboardInput(false)
        elseif key == "ESCAPE" and not C.db.minimized then
            C.draft:ClearFocus()
            C.SetMinimized(true)
            self:SetPropagateKeyboardInput(false)
        else
            self:SetPropagateKeyboardInput(true)
        end
    end)
    if C.db.minimized then
        C.db.minimized = false
        C.SetMinimized(true)
    end
    C.Refresh()
    C_Timer.After(0, C.Refresh)
end
