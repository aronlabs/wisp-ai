import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the pinned .NET 8 tool directly: no SDK or global tool installation needed.
const version = '1.3.0';
const checksum = '87089e1284137004f2299219ec241258034f06ffa9112860e9c0d75391087b15';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, 'node_modules', '.cache', 'csharpier', version);
const archive = path.join(cache, 'csharpier.nupkg');
const tools = path.join(cache, 'package');
const executable = path.join(tools, 'tools', 'net8.0', 'any', 'CSharpier.dll');

try {
  await access(executable);
} catch {
  await mkdir(cache, { recursive: true });
  const response = await fetch(
    `https://github.com/belav/csharpier/releases/download/${version}/csharpier.${version}.nupkg`,
  );
  if (!response.ok) {
    throw new Error('Cannot download the pinned CSharpier formatter.');
  }
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const hash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  if (hash !== checksum) {
    throw new Error('CSharpier package checksum mismatch.');
  }
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
        '[IO.Compression.ZipFile]::ExtractToDirectory($env:WISP_FORMAT_ARCHIVE, $env:WISP_FORMAT_TOOLS)',
    ],
    {
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, WISP_FORMAT_ARCHIVE: archive, WISP_FORMAT_TOOLS: tools },
    },
  );
}

execFileSync(
  'dotnet',
  [executable, process.argv.includes('--check') ? 'check' : 'format', 'desktop'],
  {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
  },
);
