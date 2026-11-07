local _, C = ...
WispAI = C
C.VERSION = 1
C.SLOTS = 1024
C.session = tostring(time()) .. "-" .. tostring(math.random(100000, 999999))
C.chats, C.requestsDone = {}, {}
C.pendingMessages, C.pendingChats = {}, {}
C.deletedChats = {}
C.capabilityPending = {}
C.workStarted = {}
C.connected, C.rev = false, 0
function C.Log(text)
    DEFAULT_CHAT_FRAME:AddMessage("|cffd5bb75Wisp:|r " .. text)
end
function C.NewChat()
    C.chatCounter = (C.chatCounter or 0) + 1
    C.active = C.session .. "-chat-" .. C.chatCounter
    C.db.activeChat = C.active
    C.chats[#C.chats + 1] =
        { id = C.active, title = "New conversation", messages = {}, activity = {}, status = "idle" }
    C.pendingChats[C.active] = C.chats[#C.chats]
    C.Send({ type = "new", chat = C.active })
    if C.Refresh then
        C.Refresh()
    end
end
function C.Current()
    for _, chat in ipairs(C.chats) do
        if chat.id == C.active then
            return chat
        end
    end
end
function C.Select(id)
    if C.draft and C.active then
        C.db.drafts[C.active] = C.draft:GetText()
    end
    C.active = id
    C.db.activeChat = id
    if C.draft then
        C.draft:SetText(C.db.drafts[id] or "")
    end
    C.Send({ type = "select", chat = id })
    C.Refresh()
end
function C.DeleteChat(id)
    C.workStarted[id] = nil
    C.deletedChats[id] = true
    C.pendingChats[id] = nil
    C.db.drafts[id] = nil
    for key, pending in pairs(C.pendingMessages) do
        if pending.chat == id then
            C.pendingMessages[key] = nil
        end
    end
    if C.CancelPendingChat then
        C.CancelPendingChat(id)
    end
    for index = #C.chats, 1, -1 do
        if C.chats[index].id == id then
            table.remove(C.chats, index)
        end
    end
    if C.active == id then
        C.active = C.chats[#C.chats] and C.chats[#C.chats].id or nil
        if C.draft then
            C.draft:SetText(C.active and C.db.drafts[C.active] or "")
        end
    end
    C.db.activeChat = C.active
    C.Send({ type = "delete", chat = id, nextChat = C.active })
    C.Refresh()
end
function C.Submit()
    local text = (C.draft:GetText() or ""):match("^%s*(.-)%s*$")
    local chat = C.Current()
    if text == "" or (chat and chat.status == "working") then
        return
    end
    if not C.active or C.active == "" then
        C.NewChat()
    end
    chat = C.Current()
    if not chat then
        chat = { id = C.active, title = "New conversation", messages = {}, status = "idle" }
        table.insert(C.chats, chat)
        C.pendingChats[C.active] = chat
    end
    C.messageCounter = (C.messageCounter or 0) + 1
    local messageId = C.session .. "-message-" .. C.messageCounter
    local message = { id = messageId, role = "user", text = text }
    C.pendingMessages[messageId] = { chat = C.active, message = message }
    C.workStarted[C.active] = GetTime()
    local context = C.Capture and C.Capture({ "character", "location" })
    C.Send({ type = "say", chat = C.active, text = text, messageId = messageId, context = context })
    chat = C.Current()
    if chat then
        chat.messages = chat.messages or {}
        table.insert(chat.messages, message)
        chat.status = "working"
    end
    C.draft:SetText("")
    C.db.drafts[C.active] = ""
    C.Refresh()
end
function C.MemoryAction(action, slot, key, text)
    C.memoryCounter = (C.memoryCounter or 0) + 1
    C.memoryPending = C.session .. "-memory-" .. C.memoryCounter
    C.memory = { status = "loading" }
    C.Send({
        type = "memory_" .. action,
        requestId = C.memoryPending,
        slot = slot,
        key = key,
        text = text,
        context = C.Capture({ "character" }),
    })
    if C.RefreshMemory then
        C.RefreshMemory()
    end
end
function C.SetCapability(id, enabled)
    if C.capabilityPending[id] then
        return
    end
    C.capabilityCounter = (C.capabilityCounter or 0) + 1
    local requestId = C.session .. "-capability-" .. C.capabilityCounter
    C.capabilityPending[id] = { requestId = requestId, enabled = enabled }
    C.capabilityError = nil
    C.Send({ type = "capability_set", key = id, enabled = enabled, requestId = requestId })
    if C.RefreshCapabilities then
        C.RefreshCapabilities()
    end
end
function WispAI_Receive(json)
    local ok, data = pcall(C_EncodingUtil.DeserializeJSON, json)
    if not ok or type(data) ~= "table" or data.v ~= C.VERSION or data.session ~= C.session then
        return
    end
    C.Acknowledge(data.acks or {})
    if (data.rev or 0) <= C.rev then
        return
    end
    local previous = C.Current()
    local previousState = previous and previous.status
    C.rev, C.connected, C.lastSeen = data.rev, data.connected, GetTime()
    if data.capabilities then
        C.capabilities = data.capabilities.entries
        for id, pending in pairs(C.capabilityPending) do
            local error = data.capabilities.error
            if (data.capabilities.acks or {})[id] == pending.requestId then
                C.capabilityPending[id] = nil
            elseif error and error.requestId == pending.requestId then
                C.capabilityPending[id] = nil
                C.capabilityError = error.message
            end
        end
        if C.RefreshCapabilities then
            C.RefreshCapabilities()
        end
    end
    if data.memory and (not C.memoryPending or data.memory.requestId == C.memoryPending) then
        C.memory = data.memory
        C.memoryPending = nil
        if C.RefreshMemory then
            C.RefreshMemory()
        end
    end
    if data.panels and C.ReceivePanels then
        C.ReceivePanels(data.panels, data.panelCommand)
    end
    if data.suggestions then
        C.suggestions = data.suggestions
    end
    if data.chats then
        for index = #data.chats, 1, -1 do
            if C.deletedChats[data.chats[index].id] then
                table.remove(data.chats, index)
            end
        end
        local existing, incoming = {}, {}
        for _, chat in ipairs(C.chats) do
            existing[chat.id] = chat
        end
        for _, chat in ipairs(data.chats) do
            incoming[chat.id] = chat
            local authoritative = chat.messages ~= nil
            if chat.messages == nil and existing[chat.id] then
                chat.messages = existing[chat.id].messages
            end
            C.pendingChats[chat.id] = nil
            local confirmed = {}
            for _, message in ipairs(chat.messages or {}) do
                if message.id then
                    confirmed[message.id] = true
                end
            end
            for id, optimistic in pairs(C.pendingMessages) do
                if optimistic.chat == chat.id then
                    if confirmed[id] then
                        if authoritative then
                            C.pendingMessages[id] = nil
                        else
                            chat.status = "working"
                        end
                    else
                        chat.messages = chat.messages or {}
                        table.insert(chat.messages, optimistic.message)
                        chat.status = "working"
                    end
                end
            end
            if chat.status == "working" then
                C.workStarted[chat.id] = C.workStarted[chat.id] or GetTime()
            else
                C.workStarted[chat.id] = nil
            end
        end
        for id, chat in pairs(C.pendingChats) do
            if not incoming[id] then
                table.insert(data.chats, chat)
            end
        end
        C.chats = data.chats
    end
    if not C.Current() then
        C.active = (
            data.activeChat
            and data.activeChat ~= ""
            and not C.deletedChats[data.activeChat]
            and data.activeChat
        ) or nil
        if not C.active then
            for _, chat in ipairs(C.chats) do
                if not chat.inline then
                    C.active = chat.id
                    break
                end
            end
        end
        if C.draft then
            C.draft:SetText(C.db.drafts[C.active] or "")
        end
    end
    C.db.activeChat = C.active
    local current = C.Current()
    if current and current.status == "done" and previousState == "working" then
        C.unread = C.db.minimized
        if C.db.sound then
            pcall(PlaySound, 3081)
        end
    end
    for _, request in ipairs(data.requests or {}) do
        if not C.requestsDone[request.id] then
            C.requestsDone[request.id] = true
            local result
            if request.action then
                result = C.PerformAction and C.PerformAction(request.action)
                    or { status = "unavailable", error = "Reload Wisp to enable actions" }
            else
                result = request.inspection and C.Inspect(request.inspection)
                    or C.Capture(request.sections)
            end
            C.Send({
                type = "state_result",
                chat = request.chat,
                requestId = request.id,
                data = result,
            })
        end
    end
    if data.notifications then
        C.notifications = data.notifications
        if C.RefreshAdvice then
            C.RefreshAdvice()
        end
    end
    if C.Refresh then
        C.Refresh()
    end
end
local events = CreateFrame("Frame")
events:RegisterEvent("ADDON_LOADED")
events:RegisterEvent("PLAYER_LOGIN")
events:SetScript("OnEvent", function(_, event, name)
    if event == "ADDON_LOADED" and name == "WispAI" then
        WispAIDB = WispAIDB or {}
        C.db = WispAIDB
        C.db.drafts = C.db.drafts or {}
        if C.db.sidebar == nil then
            C.db.sidebar = true
        end
        if C.db.sound == nil then
            C.db.sound = true
        end
        if C.db.showTools == nil then
            C.db.showTools = true
        end
        C.active = C.db.activeChat
    elseif event == "PLAYER_LOGIN" then
        C.BuildUI()
        if C.InitInline then
            C.InitInline()
        end
        if C.InitPanels then
            C.InitPanels()
        end
        if C.InitAdvice then
            C.InitAdvice()
        end
        C.StartTransport()
        C.Send({ type = "hello", chat = C.active, context = C.Capture({ "character", "location" }) })
    end
end)
SLASH_WISPAI1 = "/wisp"
SLASH_WISPAI2 = "/wispai"
SlashCmdList.WISPAI = function(message)
    if message == "ask" then
        if C.OpenInline then
            C.OpenInline()
        end
        return
    end
    if message == "diag" then
        local stats = C.transportStats or {}
        C.Log(
            "Slots "
                .. C.slot
                .. "/"
                .. C.SLOTS
                .. ", unchanged reads "
                .. (stats.unchanged or 0)
                .. ", revision "
                .. C.rev
                .. ", "
                .. (C.connected and "connected" or "waiting for bridge")
        )
        return
    end
    if message == "reconnect" then
        C.Send({ type = "hello", chat = C.active })
        return
    end
    C.SetMinimized(not C.db.minimized)
end
