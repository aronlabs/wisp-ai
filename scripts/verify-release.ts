import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'eve/client';
const exec = promisify(execFile),
  archive = path.resolve(process.argv[2] || 'dist/WispAI-0.2.2-windows-x64.zip');
const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-release-'));
if (!path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep)) {
  throw Error('Unsafe smoke-test directory');
}
let child: ReturnType<typeof spawn> | undefined;
try {
  await exec('tar.exe', ['-xf', archive, '-C', temporary]);
  const root = path.join(temporary, 'WispAI');
  for (const name of [
    'config.local.json',
    '.eve',
    'runtime/chats.json',
    'runtime/mcp.json',
    'runtime/memory',
    'runtime/desktop.json',
    'runtime/chatgpt-host.json',
  ]) {
    try {
      await access(path.join(root, name));
      throw Error('Personal data found in release: ' + name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
  }
  const node = path.join(root, 'runtime', 'node.exe');
  const version = (await exec(node, ['--version'])).stdout.trim();
  await exec(path.join(root, 'Wisp.exe'), ['--self-test'], { windowsHide: true });
  await writeFile(
    path.join(root, 'config.local.json'),
    JSON.stringify({ wow: path.join(temporary, 'fake-wow') }),
  );
  let log = '';
  child = spawn(node, [path.join(root, 'src', 'main.ts')], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PATH: path.dirname(node) + ';' + path.join(process.env.WINDIR || 'C:\\Windows', 'System32'),
      DO_NOT_TRACK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (data) => {
    log = (log + data).slice(-12000);
  });
  child.stderr?.on('data', (data) => {
    log = (log + data).slice(-12000);
  });
  const client = new Client({ baseUrl: 'http://127.0.0.1:43186' });
  for (let i = 0; ; i++) {
    try {
      await client.health();
      break;
    } catch {
      if (child.exitCode !== null || i > 60) {
        throw Error('Bundled bridge failed to start: ' + log);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const info = JSON.stringify(await client.info());
  if (!info.includes('manage_panel')) {
    throw Error('Bundled agent did not discover persistent panels');
  }
  const identity = JSON.parse(await readFile(path.join(root, 'runtime', 'desktop.json'), 'utf8'));
  if (identity.pid !== child.pid) {
    throw Error('Smoke test connected to another bridge');
  }
  const status = (await fetch('http://127.0.0.1:' + identity.port + '/status', {
    headers: { authorization: 'Bearer ' + identity.token },
  }).then((r) => r.json())) as { auth?: { status: string } };
  if (status.auth?.status !== 'signed_out') {
    throw Error('Fresh release did not require independent sign-in');
  }
  const response = await fetch('http://127.0.0.1:' + identity.port + '/stop', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + identity.token, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw Error('Could not stop bundled bridge');
  }
  await new Promise<void>((resolve, reject) => {
    if (child!.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(Error('Bundled bridge did not stop')), 15000);
    child!.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  console.log(
    JSON.stringify({
      node: version,
      desktopSelfTest: true,
      bridgeReady: true,
      panelToolDiscovered: true,
      noGlobalNodePath: true,
      noPersonalData: true,
      independentLoginRequired: true,
    }),
  );
} finally {
  if (child && child.exitCode === null && child.pid) {
    await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    }).catch(() => {});
  }
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
