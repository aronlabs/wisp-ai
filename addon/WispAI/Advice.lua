local _, C = ...
local toast, body
local lastWeapons={}
local function busy()
    if (InCombatLockdown and InCombatLockdown()) or (UnitAffectingCombat and UnitAffectingCombat("player")) then return true end
    for _,chat in ipairs(C.chats or {}) do if chat.status=="working" then return true end end
    return false
end
function C.SendAdviceEvent(event)
    local preferences=C.suggestions or {}
    if (event.kind=="level_up" and not preferences.levelUp) or (event.kind=="weapon" and not preferences.weapon) or busy() then return end
    C.Send({type="advice_event",data=event,context=C.Capture({"character","location"})})
end
function C.RefreshAdvice()
    if not toast then return end
    local tip=(C.notifications or {})[#(C.notifications or {})]
    if not tip then toast:Hide();return end
    toast.chatId=tip.id;local preview=tip.title
    for _,chat in ipairs(C.chats or {}) do if chat.id==tip.id then
        for _,message in ipairs(chat.messages or {}) do if message.role=="assistant" and message.text and message.text~="" then
            preview=message.text:gsub("%[%[ref:([%w_-]+)%]%]",function(key)local ref=message.references and message.references[key];return ref and ref.label or "Reference"end):gsub("[%*`]",""):gsub("|","||"):sub(1,220);break
        end end
    end end
    body:SetText(preview);toast:Show()
end
function C.InitAdvice()
    local events=CreateFrame("Frame");events:RegisterEvent("PLAYER_LEVEL_UP");events:RegisterEvent("PLAYER_EQUIPMENT_CHANGED")
    for _,slot in ipairs({16,17,18}) do lastWeapons[slot]=GetInventoryItemID and GetInventoryItemID("player",slot) end
    events:SetScript("OnEvent",function(_,event,value)
        if event=="PLAYER_LEVEL_UP" then local level=value;C_Timer.After(2,function()C.SendAdviceEvent({kind="level_up",level=level})end)
        elseif event=="PLAYER_EQUIPMENT_CHANGED" and (value==16 or value==17 or value==18) then
            local itemId=GetInventoryItemID and GetInventoryItemID("player",value);local previous=lastWeapons[value];lastWeapons[value]=itemId
            if itemId and itemId~=previous then C_Timer.After(2,function()C.SendAdviceEvent({kind="weapon",itemId=itemId,slot=value})end) end
        end
    end)
    toast=CreateFrame("Frame","WispAISuggestion",UIParent,"BackdropTemplate");toast:SetSize(350,150);toast:SetPoint("BOTTOMRIGHT",UIParent,"BOTTOMRIGHT",-40,190);toast:SetFrameStrata("DIALOG");toast:SetClampedToScreen(true)
    toast:SetBackdrop({bgFile="Interface\\Tooltips\\UI-Tooltip-Background",edgeFile="Interface\\Tooltips\\UI-Tooltip-Border",tile=true,tileSize=16,edgeSize=12,insets={left=3,right=3,top=3,bottom=3}});toast:SetBackdropColor(.09,.075,.055,.97);toast:SetBackdropBorderColor(.43,.38,.28,1)
    local title=toast:CreateFontString(nil,"OVERLAY","GameFontNormal");title:SetPoint("TOPLEFT",12,-12);title:SetTextColor(.84,.72,.43);title:SetText("Wisp suggestion")
    body=toast:CreateFontString(nil,"OVERLAY","GameFontNormal");body:SetPoint("TOPLEFT",12,-36);body:SetWidth(325);body:SetJustifyH("LEFT");body:SetWordWrap(true)
    local read=CreateFrame("Button",nil,toast,"UIPanelButtonTemplate");read:SetSize(95,24);read:SetPoint("BOTTOMLEFT",12,12);read:SetText("Read");read:SetScript("OnClick",function()local id=toast.chatId;toast:Hide();C.Select(id);C.SetMinimized(false)end)
    local dismiss=CreateFrame("Button",nil,toast,"UIPanelButtonTemplate");dismiss:SetSize(95,24);dismiss:SetPoint("LEFT",read,"RIGHT",8,0);dismiss:SetText("Dismiss");dismiss:SetScript("OnClick",function()C.Send({type="dismiss_tip",chat=toast.chatId});for i=#(C.notifications or {}),1,-1 do if C.notifications[i].id==toast.chatId then table.remove(C.notifications,i)end end;C.RefreshAdvice()end)
    toast:Hide()
end
