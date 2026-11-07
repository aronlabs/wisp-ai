import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowsVault } from '../src/secret-vault.ts';
import { startDesktopServer } from '../src/desktop-server.ts';
test('desktop controls require the session token and reject browser origins', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wow-desktop-'));
  const server = await startDesktopServer(root, async () => ({ ok: true }), 0);
  try {
    const identity = JSON.parse(await readFile(path.join(root, 'desktop.json'), 'utf8'));
    const url = 'http://127.0.0.1:' + identity.port + '/status';
    assert.equal((await fetch(url)).status, 403);
    assert.equal(
      (
        await fetch(url, {
          headers: { authorization: 'Bearer ' + identity.token, origin: 'https://example.com' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(url, { headers: { authorization: 'Bearer ' + identity.token } })).status,
      200,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
test(
  'compiled Windows secret helper round-trips UTF-8 with per-user encryption',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const exe = fileURLToPath(new URL('../Wisp.exe', import.meta.url));
    try {
      await access(exe);
    } catch {
      t.skip('Compile desktop helper first');
      return;
    }
    const vault = new WindowsVault(exe),
      key = 'test-' + Date.now();
    try {
      await vault.write(key, 'private-é-测试-value');
      assert.equal(await vault.read(key), 'private-é-测试-value');
    } finally {
      await vault.write(key, '');
    }
  },
);
