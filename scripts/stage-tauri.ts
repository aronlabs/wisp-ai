import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function stageTauri() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const stage = path.resolve(root, 'src-tauri/resources/payload');
  if (stage !== path.resolve(root, 'src-tauri', 'resources', 'payload')) {
    throw Error('Invalid payload directory.');
  }
  await readFile(path.join(root, 'simulator', 'wowsimcli.exe'));
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const name of ['src', 'agent', 'addon', 'scripts', 'simulator']) {
    await cp(path.join(root, name), path.join(stage, name), { recursive: true });
  }
  for (const name of ['package.json', 'package-lock.json', 'LICENSE', 'NOTICE']) {
    await copyFile(path.join(root, name), path.join(stage, name));
  }
  const npm = process.env.npm_execpath || path.join(root, 'runtime/npm/bin/npm-cli.js');
  execFileSync(
    process.execPath,
    [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: stage, windowsHide: true, stdio: 'inherit' },
  );
  await mkdir(path.join(stage, 'runtime'), { recursive: true });
  await copyFile(
    process.execPath,
    path.join(stage, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
  );
  const npmDirectory = path.resolve(path.dirname(npm), '..');
  await cp(npmDirectory, path.join(stage, 'runtime', 'npm'), { recursive: true });
  const license = await fetch(
    'https://raw.githubusercontent.com/nodejs/node/v' + process.versions.node + '/LICENSE',
  );
  if (!license.ok) {
    throw Error('Cannot obtain the bundled Node license.');
  }
  await writeFile(path.join(stage, 'runtime/NODE-LICENSE.txt'), await license.text());
  await writeFile(
    path.join(stage, 'BUILD.json'),
    JSON.stringify(
      {
        version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2,
    ),
  );
  console.log('Staged application resources without personal data.');
}
