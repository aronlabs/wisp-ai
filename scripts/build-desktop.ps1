$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Security.dll /out:"$root\Wisp.exe" "$root\desktop\Wisp.cs"
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
Write-Output 'Built Wisp.exe'
