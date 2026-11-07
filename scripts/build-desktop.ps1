param([string]$Output)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Output) { $Output = Join-Path $root 'Wisp.exe' }
& (Join-Path $PSScriptRoot 'build-icon.ps1')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $root 'desktop') -Filter '*.cs' -File | Select-Object -ExpandProperty FullName)
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Security.dll /win32icon:"$root\assets\wisp.ico" /resource:"$root\assets\wisp.png",Wisp.Brand /out:"$Output" @sources
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
Write-Output 'Built Wisp.exe'
