param([string]$NodePath, [string]$NpmDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $NodePath) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $NodePath = $nodeCommand.Source }
    elseif (Test-Path -LiteralPath (Join-Path $root 'runtime-node.txt')) { $NodePath = (Get-Content -LiteralPath (Join-Path $root 'runtime-node.txt') -Raw).Trim() }
}
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) { throw 'Node 24+ is needed on the build machine.' }
if (-not $NpmDirectory) {
    $candidates = @((Join-Path (Split-Path -Parent $NodePath) 'node_modules\npm'), (Join-Path $root '..\..\work\npm\package'))
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath (Join-Path $candidate 'bin\npx-cli.js')) { $NpmDirectory = (Resolve-Path -LiteralPath $candidate).Path; break } }
}
if (-not $NpmDirectory) { throw 'Provide -NpmDirectory for the npm distribution bundled with Node.' }
& (Join-Path $PSScriptRoot 'build-desktop.ps1')
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $root ('dist\build-' + $stamp + '\WispAI')
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$env:WISP_RELEASE_STAGE = $stage
$env:WISP_RELEASE_NODE = $NodePath
$env:WISP_RELEASE_NPM = $NpmDirectory
& $NodePath (Join-Path $PSScriptRoot 'stage-release.ts')
if ($LASTEXITCODE -ne 0) { throw 'Release staging failed.' }
$archive = Join-Path $root ('dist\WispAI-' + $version + '-windows-x64.zip')
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tar) {
    & $tar.Source -a -cf $archive -C (Split-Path -Parent $stage) 'WispAI'
    if ($LASTEXITCODE -ne 0) { throw 'ZIP compression failed.' }
} else { Compress-Archive -LiteralPath $stage -DestinationPath $archive -Force }
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($archive + '.sha256') -Value ($hash + '  ' + (Split-Path -Leaf $archive))
Write-Output $archive
