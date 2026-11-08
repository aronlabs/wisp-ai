import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stageTauri } from './stage-tauri.ts';
import { createRequire } from 'node:module';
import { writeUpdateManifest } from './update-manifest.ts';
import {
  nativeBuildContext,
  nativeBuildKey,
  restoreNativeBinary,
  saveNativeBinary,
} from './native-cache.ts';
const desktop = path.resolve('apps/desktop');
const require = createRequire(path.join(desktop, 'package.json'));
const cli = require.resolve('@tauri-apps/cli/tauri.js');
function tauri(args: string[]) {
  execFileSync(process.execPath, [cli, ...args], {
    windowsHide: true,
    stdio: 'inherit',
    cwd: desktop,
    env: {
      ...process.env,
      PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || ''),
    },
  });
}
const started = performance.now();
await stageTauri({ packaged: true });
const staged = performance.now();
// Build the frontend first: its actual output, including VITE_* substitutions,
// belongs to the cache key because Tauri embeds it in the native executable.
execFileSync(
  process.execPath,
  [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), 'build'],
  {
    cwd: desktop,
    windowsHide: true,
    stdio: 'inherit',
  },
);
const frontendBuilt = performance.now();
const context = nativeBuildContext();
const key = await nativeBuildKey(process.cwd(), context);
const cache = path.resolve('node_modules/.cache/wisp-native');
const executable = path.join(desktop, 'src-tauri/target/release/wisp.exe');
// Custom Tauri overrides may reference inputs outside the checked-in project.
// They always use a fresh build rather than risk reusing the wrong executable.
const cacheable = !process.env.TAURI_CONFIG;
const reused =
  cacheable &&
  process.env.WISP_FORCE_NATIVE_BUILD !== '1' &&
  (await restoreNativeBinary(cache, key, executable));
if (!reused) {
  tauri(['build', '--no-bundle', '--', '--locked']);
  if (cacheable) {
    if (key !== (await nativeBuildKey(process.cwd(), context))) {
      throw Error('Native build inputs changed during compilation. No binary was cached.');
    }
    await saveNativeBinary(cache, key, executable);
  }
}
const nativeBuilt = performance.now();
const nativeBinarySha256 = createHash('sha256')
  .update(await readFile(executable))
  .digest('hex');
// Always assemble current bridge/agent/addon/simulator resources. Only the
// unchanged, fully optimized native executable may be reused.
const signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
tauri([
  'bundle',
  '--bundles',
  'nsis',
  '--config',
  JSON.stringify({ bundle: { createUpdaterArtifacts: signed } }),
]);
const bundled = performance.now();
await mkdir('dist', { recursive: true });
await writeFile(
  'dist/build-metrics.json',
  JSON.stringify(
    {
      nativeCacheHit: Boolean(reused),
      nativeInputsKey: key,
      nativeBinarySha256,
      milliseconds: {
        stage: staged - started,
        frontend: frontendBuilt - staged,
        native: nativeBuilt - frontendBuilt,
        bundle: bundled - nativeBuilt,
        total: bundled - started,
      },
    },
    null,
    2,
  ),
);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const folder = 'apps/desktop/src-tauri/target/release/bundle/nsis';
const installers = (await readdir(folder)).filter((file) => file.endsWith('-setup.exe'));
if (installers.length !== 1) {
  throw Error('Expected one Windows installer.');
}
const destination = 'dist/WispAI-' + version + '-windows-x64-setup.exe';
await copyFile(path.join(folder, installers[0]), destination);
if (signed) {
  await copyFile(path.join(folder, installers[0] + '.sig'), destination + '.sig');
  await writeUpdateManifest(version, destination);
}
const hash = createHash('sha256')
  .update(await readFile(destination))
  .digest('hex');
await writeFile(destination + '.sha256', hash + '  ' + path.basename(destination) + '\n');
console.log(destination);
