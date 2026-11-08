; Only installed, read-only application resources are replaced. Conversations,
; memory, credentials and the Eve workspace live outside $INSTDIR in AppData.
!macro NSIS_HOOK_PREINSTALL
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=wisp-update-helper.exe "${MAINBINARYSRCPATH}"
  ExecWait '"$PLUGINSDIR\wisp-update-helper.exe" --prepare-update' $0
  ${If} $0 != 0
    Abort "Wisp could not stop safely. Finish the active reply, exit Wisp from the tray, and try again."
  ${EndIf}
  SetOutPath "$INSTDIR"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  ; Existing Wisp executable + build marker identify the application-owned tree.
  ; A fresh/custom directory without these markers is never recursively removed.
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
  ${AndIf} ${FileExists} "$INSTDIR\payload\BUILD.json"
  ${AndIf} ${FileExists} "$INSTDIR\payload\package.json"
    RMDir /r "$INSTDIR\payload"
    ${If} ${FileExists} "$INSTDIR\payload\*.*"
      Abort "Wisp resources are still in use. Exit Wisp from the tray and try again."
    ${EndIf}
  ${EndIf}
!macroend
