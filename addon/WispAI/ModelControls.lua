local _, C = ...
local label, setText, MUTED = C.Widgets.label, C.Widgets.setText, C.Widgets.MUTED
C.workStarted = C.workStarted or {}
local modelControls = {}
C.modelPending = {}
local function defaultEffort(model)
    if model.defaultEffort == "provider-default" then
        return "provider-default"
    end
    for _, effort in ipairs(model.efforts or {}) do
        if effort == "medium" then
            return effort
        end
    end
    return model.defaultEffort or model.efforts[1] or "provider-default"
end
local function effortLabel(effort)
    if effort == "provider-default" then
        return "Default"
    elseif effort == "none" then
        return "Off"
    elseif effort == "enabled" then
        return "On"
    end
    return effort
end
function C.SetChatModel(chat, model, effort)
    if not chat or chat.status == "working" or C.modelPending[chat.id] then
        return
    end
    C.modelCounter = (C.modelCounter or 0) + 1
    local id = C.session .. "-model-" .. C.modelCounter
    C.modelPending[chat.id] = id
    C.Send({
        type = "chat_model_set",
        chat = chat.id,
        requestId = id,
        data = { model = model, effort = effort, inline = chat.inline },
    })
    C.RefreshModelControls()
end
function C.RefreshModelControls()
    local catalog = C.modelCatalog or {}
    for _, controls in ipairs(modelControls) do
        local chat = controls.current()
        if chat and C.modelPending[chat.id] == chat.modelRequestId then
            C.modelPending[chat.id] = nil
        end
        local selection = chat and chat.modelSettings or {}
        local model = selection.model or catalog.defaultModel
        local selected
        for _, candidate in ipairs(catalog.models or {}) do
            if candidate.slug == model then
                selected = candidate
            end
        end
        local pending = chat and C.modelPending[chat.id]
        controls.model:SetWidth(math.max(90, math.min(165, controls:GetParent():GetWidth() - 150)))
        if controls.composer then
            local narrow = controls.composer:GetWidth() < 380
            if controls.narrow ~= narrow then
                controls.narrow = narrow
                controls.composer:SetHeight(narrow and 106 or 78)
                C.draft:ClearAllPoints()
                C.draft:SetPoint("TOPLEFT", 10, -7)
                C.draft:SetPoint("BOTTOMRIGHT", -10, narrow and 56 or 28)
                controls.send:ClearAllPoints()
                controls.send:SetPoint("BOTTOMRIGHT", -7, narrow and 31 or 5)
                controls.transcript:SetPoint("BOTTOMRIGHT", -31, narrow and 132 or 104)
                controls.scrollBar:SetPoint("BOTTOMRIGHT", -10, narrow and 132 or 104)
            end
        end
        local working = chat and chat.status == "working"
        setText(
            controls.model,
            pending and "Saving..."
                or (
                    chat and chat.modelError and "Model error"
                    or (selected and selected.displayName or "Model...")
                )
        )
        setText(
            controls.effort,
            "Effort: "
                .. effortLabel(selection.effort or (selected and defaultEffort(selected)) or "--")
        )
        controls.model:SetEnabled(C.connected and not pending and not working)
        controls.effort:SetEnabled(
            C.connected
                and selected ~= nil
                and not pending
                and not working
                and #selected.efforts > 0
        )
    end
end
function C.CreateModelControls(parent, name, current, ensure)
    local controls = CreateFrame("Frame", name, parent)
    controls:SetSize(280, 22)
    controls.current = current
    local function choose(model, effort)
        local chat = current() or (ensure and ensure())
        C.SetChatModel(chat, model, effort)
    end
    local function selector(text, width, click)
        local control = CreateFrame("Button", nil, controls)
        control:SetSize(width, 22)
        local caption = label(control, text, MUTED)
        caption:SetFontObject("GameFontNormalSmall")
        caption:SetPoint("LEFT", 2, 0)
        caption:SetPoint("RIGHT", -12, 0)
        caption:SetWordWrap(false)
        control:SetFontString(caption)
        control:SetNormalFontObject("GameFontNormalSmall")
        control:SetHighlightFontObject("GameFontHighlightSmall")
        local arrow = label(control, "v", MUTED)
        arrow:SetFontObject("GameFontNormalSmall")
        arrow:SetPoint("RIGHT", -2, 0)
        control:SetText(text)
        control:SetScript("OnClick", click)
        return control
    end
    controls.model = selector("Model...", 165, function(self)
        local models = C.modelCatalog and C.modelCatalog.models or {}
        if #models == 0 then
            C.Send({ type = "model_catalog" })
            return
        end
        if MenuUtil and MenuUtil.CreateContextMenu then
            MenuUtil.CreateContextMenu(self, function(_, root)
                root:CreateTitle("Model")
                for _, candidate in ipairs(models) do
                    local option = candidate
                    root:CreateRadio(option.displayName, function()
                        local chat = current()
                        return option.slug
                            == (
                                chat and chat.modelSettings and chat.modelSettings.model
                                or C.modelCatalog.defaultModel
                            )
                    end, function()
                        choose(option.slug)
                    end)
                end
            end)
        end
    end)
    controls.model:SetPoint("LEFT")
    controls.effort = selector("Effort: --", 110, function(self)
        local chat = current()
        local model = chat and chat.modelSettings and chat.modelSettings.model
            or C.modelCatalog.defaultModel
        for _, candidate in ipairs(C.modelCatalog.models or {}) do
            if candidate.slug == model and MenuUtil and MenuUtil.CreateContextMenu then
                MenuUtil.CreateContextMenu(self, function(_, root)
                    root:CreateTitle("Reasoning effort")
                    for _, effort in ipairs(candidate.efforts) do
                        local option = effort
                        root:CreateRadio(effortLabel(option), function()
                            return option
                                == (
                                    chat and chat.modelSettings and chat.modelSettings.effort
                                    or defaultEffort(candidate)
                                )
                        end, function()
                            choose(model, option)
                        end)
                    end
                end)
            end
        end
    end)
    controls.effort:SetPoint("LEFT", controls.model, "RIGHT", 5, 0)
    for _, control in ipairs({ controls.model, controls.effort }) do
        control:SetScript("OnEnter", function(self)
            local chat = current()
            GameTooltip:SetOwner(self, "ANCHOR_TOP")
            GameTooltip:SetText(
                chat and chat.modelError
                    or (C.modelCatalog and C.modelCatalog.error)
                    or "Applies to the next message in this conversation."
            )
            GameTooltip:Show()
        end)
        control:SetScript("OnLeave", function()
            GameTooltip:Hide()
        end)
    end
    modelControls[#modelControls + 1] = controls
    C.RefreshModelControls()
    return controls
end
