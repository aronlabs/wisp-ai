import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageTauri } from './stage-tauri.ts';
await stageTauri();
execFileSync(
  process.execPath,
  [path.resolve('node_modules/@tauri-apps/cli/tauri.js'), 'build', '--bundles', 'nsis'],
  {
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || ''),
    },
  },
);
await mkdir('dist', { recursive: true });
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const folder = 'src-tauri/target/release/bundle/nsis';
const installers = (await readdir(folder)).filter((file) => file.endsWith('-setup.exe'));
if (installers.length !== 1) {
  throw Error('Expected one Windows installer.');
}
const destination = 'dist/WispAI-' + version + '-windows-x64-setup.exe';
await copyFile(path.join(folder, installers[0]), destination);
const hash = createHash('sha256')
  .update(await readFile(destination))
  .digest('hex');
await writeFile(destination + '.sha256', hash + '  ' + path.basename(destination) + '\n');
console.log(destination);
