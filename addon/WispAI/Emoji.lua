local _, C = ...
local textures = {}
local function texture(index)
    if not textures[index] then
        local cell = index % 1024
        -- Include the transparent border so filtering keeps round edges intact.
        local x, y = (cell % 32) * 32, math.floor(cell / 32) * 32
        textures[index] = string.format(
            "|TInterface\\AddOns\\WispAI\\Textures\\Emoji\\Emoji%d.tga:14:14:0:-2:1024:1024:%d:%d:%d:%d|t",
            math.floor(index / 1024),
            x,
            x + 32,
            y,
            y + 32
        )
    end
    return textures[index]
end
local function codepoint(char)
    local a, b, c, d = char:byte(1, 4)
    if d then
        return (a - 240) * 262144 + (b - 128) * 4096 + (c - 128) * 64 + d - 128
    elseif c then
        return (a - 224) * 4096 + (b - 128) * 64 + c - 128
    elseif b then
        return (a - 192) * 64 + b - 128
    end
    return a
end
local function regional(code)
    return code >= 0x1F1E6 and code <= 0x1F1FF
end
local function extension(code)
    return code == 0xFE0F
        or code == 0xFE0E
        or code == 0x20E3
        or (code >= 0x1F3FB and code <= 0x1F3FF)
        or (code >= 0xE0020 and code <= 0xE007F)
end
local function render(text)
    if not text:find("[\194-\244]") then
        return text
    end
    local chars, codes = {}, {}
    for char in text:gmatch("[%z\1-\127\194-\244][\128-\191]*") do
        chars[#chars + 1] = char
        codes[#codes + 1] = codepoint(char)
    end
    local result, i = {}, 1
    while i <= #chars do
        local last = i
        local candidate = C.EmojiData[chars[i]] ~= nil
            or (codes[i] >= 0x1F000 and codes[i] <= 0x1FAFF)
            or (chars[i]:match("^[%d#*]$") and (codes[i + 1] == 0xFE0F or codes[i + 1] == 0x20E3))
        if regional(codes[i]) and codes[i + 1] and regional(codes[i + 1]) then
            last = i + 1
        end
        while candidate and codes[last + 1] do
            if extension(codes[last + 1]) then
                last = last + 1
            elseif codes[last + 1] == 0x200D and codes[last + 2] then
                last = last + 2
            else
                break
            end
        end
        local raw = table.concat(chars, "", i, last)
        local normalized = raw:gsub("\239\184\143", "")
        local index = C.EmojiData[normalized]
        if raw:find("\239\184\142", 1, true) then
            -- Explicit text presentation wins over emoji presentation.
            result[#result + 1] = raw:gsub("\239\184\142", "")
        elseif index and (codes[i] > 255 or last > i) then
            result[#result + 1] = texture(index)
        elseif (codes[i] >= 0x1F000 and codes[i] <= 0x1FAFF) or (last > i and index == nil) then
            -- Future/unrecognized sequences stay one readable unit.
            result[#result + 1] = string.format("[emoji U+%X]", codes[i])
        else
            result[#result + 1] = raw
        end
        i = last + 1
    end
    return table.concat(result)
end
C.Emoji = { render = render }
