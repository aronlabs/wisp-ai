-- Outbound framing adapted from thott-bot/chat Transport.lua, GPL-3.0-only.
local _, C = ...
local BITS, DATA = 128, 15
local counter, seq, queue, shown, awaiting = time() % 128, 0, {}, {}, {}
local transmitting
local nextReceive, emptyDelay = 0, 0.5
C.transportStats = { loads = 0, unchanged = 0 }
C.slot = 1
function C.WakeTransport()
    nextReceive = 0
    emptyDelay = 0.5
end
local function frames(packet)
    packet.nextSlot = C.slot
    packet.receivedRev = C.rev
    packet.transport = {
        loadError = C.transportStats.loadError,
        error = C.transportStats.error,
    }
    local body = C_EncodingUtil.CompressString(
        C_EncodingUtil.SerializeJSON(packet),
        Enum.CompressionMethod.Zlib
    )
    if #body > 65535 then
        error("Message is too large")
    end
    local stream = string.char(math.floor(#body / 256), #body % 256) .. body
    local out = {}
    for i = 1, #stream, DATA do
        local part = stream:sub(i, i + DATA - 1)
        out[#out + 1] = part .. string.rep("\0", DATA - #part)
    end
    return out
end
local function enqueue(packet)
    queue[#queue + 1] = { packet = packet, frames = frames(packet), index = 1 }
    packet.queued = true
end
function C.Send(packet)
    seq = seq + 1
    if packet.type == "hello" and C.IntegrationReport then
        packet.integrations = C.IntegrationReport()
    end
    packet.session = C.session
    packet.seq = seq
    packet.at = time()
    if packet.type ~= "poll" and not packet.heartbeat then
        awaiting[seq] = packet
        C.WakeTransport()
    end
    enqueue(packet)
end
function C.Acknowledge(ids)
    for _, id in ipairs(ids) do
        awaiting[id] = nil
    end
end
function C.CancelPendingChat(id)
    for key, packet in pairs(awaiting) do
        if packet.chat == id then
            awaiting[key] = nil
        end
    end
    for index = #queue, 1, -1 do
        if queue[index].packet.chat == id then
            table.remove(queue, index)
        end
    end
end
local function transmit()
    local item = queue[1]
    if not item then
        return
    end
    local frame = string.char((item.index == 1 and 128 or 0) + counter) .. item.frames[item.index]
    counter = (counter + 1) % 128
    for byte = 1, #frame do
        local value = frame:byte(byte)
        for bit = 0, 7 do
            local index = (byte - 1) * 8 + bit + 1
            local on = math.floor(value / 2 ^ (7 - bit)) % 2 == 1
            if shown[index] ~= on then
                local name = string.format("WispAI_B%03d", index)
                if on then
                    C_AddOns.EnableAddOn(name)
                else
                    C_AddOns.DisableAddOn(name)
                end
                shown[index] = on
            end
        end
    end
    C_AddOns.SaveAddOns()
    item.index = item.index + 1
    if item.index > #item.frames then
        item.packet.queued = nil
        item.packet.lastSent = GetTime()
        table.remove(queue, 1)
    end
end
local function receive()
    -- The hello can be acknowledged before Eve is ready. Keep reading until
    -- startup completes, even after that acknowledgement clears the outbox.
    local waiting = not C.connected or next(awaiting) ~= nil
    for _, chat in ipairs(C.chats or {}) do
        if chat.status == "working" then
            waiting = true
            break
        end
    end
    -- Read only while waiting for startup or a user turn. Idle clients do not
    -- consume one-use channels; unchanged replies back off below.
    if not waiting or GetTime() < nextReceive then
        return
    end
    if C.slot > C.SLOTS then
        C.exhausted = true
        if C.Refresh then
            C.Refresh()
        end
        return
    end
    local name = string.format("WispAI_S%04d", C.slot)
    C_AddOns.EnableAddOn(name)
    C.slot = C.slot + 1
    local before = C.rev
    local loaded, reason = C_AddOns.LoadAddOn(name)
    C.transportStats.loadError = not loaded and tostring(reason) or nil
    if loaded then
        C.transportStats.loads = C.transportStats.loads + 1
        if C.rev > before then
            emptyDelay = 0.5
            nextReceive = GetTime() + 0.5
        else
            C.transportStats.unchanged = C.transportStats.unchanged + 1
            nextReceive = GetTime() + emptyDelay
            emptyDelay = math.min(8, emptyDelay * 2)
        end
        C.Send({ type = "poll", chat = C.active })
    else
        C.slot = C.slot - 1
        nextReceive = GetTime() + 2
    end
end
function C.StartTransport()
    if not C_AddOns.DoesAddOnExist("WispAI_B128") then
        C.Log("Helper channels are missing. Restart WoW after installation.")
        return
    end
    transmitting = C_Timer.NewTicker(0.04, function()
        local ok, err = pcall(transmit)
        if not ok then
            C.Log(tostring(err))
            transmitting:Cancel()
        end
    end)
    C_Timer.NewTicker(0.5, function()
        local ok, reason = pcall(receive)
        C.transportStats.error = not ok and tostring(reason) or nil
    end)
    C_Timer.NewTicker(2, function()
        for _, packet in pairs(awaiting) do
            if not packet.queued and packet.lastSent and GetTime() - packet.lastSent > 5 then
                enqueue(packet)
            end
        end
    end)
    C_Timer.NewTicker(60, function()
        C.Send({ type = "hello", chat = C.active, heartbeat = true })
    end)
end
