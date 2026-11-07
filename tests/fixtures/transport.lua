now = 0
loads = 0
packets = {}
timers = {}
C = {
    session = "game",
    rev = 0,
    connected = false,
    SLOTS = 1024,
    chats = { { status = "idle" } },
    active = "chat",
}
function time()
    return 123
end
function GetTime()
    return now
end
Enum = { CompressionMethod = { Zlib = 1 } }
C_EncodingUtil = {
    SerializeJSON = function(packet)
        packets[#packets + 1] = packet
        return "{}"
    end,
    CompressString = function(text)
        return text
    end,
}
C_Timer = {
    NewTicker = function(seconds, fn)
        timers[seconds] = fn
        return { Cancel = function() end }
    end,
}
C_AddOns = {
    DoesAddOnExist = function()
        return true
    end,
    EnableAddOn = function() end,
    DisableAddOn = function() end,
    SaveAddOns = function() end,
    LoadAddOn = function()
        loads = loads + 1
        if nextRev then
            C.rev = nextRev
            nextRev = nil
            if nextConnected == nil then
                C.connected = true
            else
                C.connected = nextConnected
                nextConnected = nil
            end
            C.Acknowledge({ 1 })
        end
        return true
    end,
}
function PlaySoundFile()
    return true, 1
end
function StopSound() end
