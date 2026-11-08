import { access, cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function stageTauri() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const stage = path.resolve(root, 'apps/desktop/src-tauri/resources/payload');
  if (stage !== path.join(root, 'apps', 'desktop', 'src-tauri', 'resources', 'payload')) {
    throw Error('Invalid payload directory.');
  }
  await readFile(path.join(root, 'simulator/wowsimcli.exe'));
  await rm(stage, { recursive: true, force: true });
  // Hoisting is restricted to the standalone deployment: Windows installer resources
  // must contain real directories, without junctions back to the developer's store.
  const executable = process.env.npm_execpath || 'pnpm';
  const args = [
    '--filter',
    '@wisp/bridge',
    '--prod',
    'deploy',
    '--ignore-scripts',
    '--config.node-linker=hoisted',
    stage,
  ];
  const javascript = /\.(?:c?js|mjs)$/.test(executable);
  execFileSync(
    javascript ? process.execPath : executable,
    javascript ? [executable, ...args] : args,
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  );
  for (const name of ['addon', 'simulator']) {
    await cp(path.join(root, name), path.join(stage, name), { recursive: true });
  }
  for (const name of ['LICENSE', 'NOTICE']) {
    await copyFile(path.join(root, name), path.join(stage, name));
  }
  await mkdir(path.join(stage, 'runtime'), { recursive: true });
  await copyFile(
    process.execPath,
    path.join(stage, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'),
  );
  // npm remains available for user-configured npx MCP servers. It is not used
  // to install Wisp or to assemble its dependency graph.
  let npmDirectory = '';
  for (const relative of ['npm', 'node_modules/npm', '../lib/node_modules/npm']) {
    const candidate = path.resolve(path.dirname(process.execPath), relative);
    try {
      await access(path.join(candidate, 'bin/npx-cli.js'));
      npmDirectory = candidate;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  if (!npmDirectory) {
    throw Error('Cannot locate npm in the build Node distribution.');
  }
  await cp(npmDirectory, path.join(stage, 'runtime/npm'), { recursive: true });
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
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2,
    ),
  );
  console.log(
    'Deployed production bridge, agent and protocol without personal data or desktop build tools.',
  );
}
