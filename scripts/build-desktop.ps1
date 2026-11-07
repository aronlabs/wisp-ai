$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$executable = if ($node) { $node.Source } else { Join-Path $root 'runtime\node.exe' }
Push-Location $root
try {
    & $executable (Join-Path $PSScriptRoot 'build-desktop.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Tauri installer build failed.' }
} finally { Pop-Location }
