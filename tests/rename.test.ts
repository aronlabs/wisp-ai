import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  copyFile,
  rename,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { migrateGameSaves, retireLegacyAddons } from '../src/rename-migration.ts';
import { WindowsVault } from '../src/secret-vault.ts';

test('rename imports preferences and bindings once, retaining originals and newer Wisp data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-rename-'));
  try {
    const saves = path.join(root, 'WTF', 'Account', 'account', 'SavedVariables'),
      character = path.join(root, 'WTF', 'Account', 'account', 'realm', 'player');
    await mkdir(saves, { recursive: true });
    await mkdir(character, { recursive: true });
    const original =
      'WoWCompanionDB = { draft = "Keep Companion in my original text", active = "saved-chat" }';
    await writeFile(path.join(saves, 'WoWCompanion.lua'), original);
    await writeFile(path.join(saves, 'WoWCompanion.lua.bak'), original);
    await writeFile(
      path.join(character, 'bindings-cache.wtf'),
      'bind CTRL-H WOWCOMPANION_INLINE\nbind Q OTHER_ACTION\n',
    );
    assert.equal(await migrateGameSaves(root), 3);
    assert.equal(await readFile(path.join(saves, 'WoWCompanion.lua'), 'utf8'), original);
    assert.equal(
      await readFile(path.join(saves, 'WispAI.lua'), 'utf8'),
      original.replace('WoWCompanionDB', 'WispAIDB'),
    );
    assert.match(
      await readFile(path.join(character, 'bindings-cache.wtf'), 'utf8'),
      /WISPAI_INLINE/,
    );
    assert.match(
      await readFile(path.join(character, 'bindings-cache.wtf.before-wisp'), 'utf8'),
      /WOWCOMPANION_INLINE/,
    );
    await writeFile(path.join(saves, 'WispAI.lua'), 'WispAIDB = { newer = true }');
    assert.equal(await migrateGameSaves(root), 0);
    assert.match(await readFile(path.join(saves, 'WispAI.lua'), 'utf8'), /newer/);
  } finally {
    assert.ok(root.startsWith(path.join(tmpdir(), 'wisp-rename-')));
    await rm(root, { recursive: true, force: true });
  }
});
test('retirement moves only legacy addon directories outside AddOns and is repeatable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-rename-'));
  try {
    const addons = path.join(root, 'Interface', 'AddOns');
    for (const name of [
      'WoWCompanion',
      'WoWCompanion_Payload',
      'WoWCompanion_B001',
      'WoWCompanion_S1024',
      'WispAI',
      'OtherAddon',
      'WoWCompanionUnrelated',
    ]) {
      await mkdir(path.join(addons, name), { recursive: true });
      await writeFile(path.join(addons, name, 'keep.txt'), 'original');
    }
    const result = await retireLegacyAddons(root);
    assert.equal(result.count, 4);
    assert.equal(
      await readFile(path.join(result.backup!, 'WoWCompanion', 'keep.txt'), 'utf8'),
      'original',
    );
    assert.deepEqual((await readdir(addons)).sort(), [
      'OtherAddon',
      'WispAI',
      'WoWCompanionUnrelated',
    ]);
    assert.equal((await retireLegacyAddons(root)).count, 0);
  } finally {
    assert.ok(root.startsWith(path.join(tmpdir(), 'wisp-rename-')));
    await rm(root, { recursive: true, force: true });
  }
});
test(
  'Windows credential migration copies encrypted data once without resurrecting disconnected secrets',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const binary = path.resolve('Wisp.exe');
    try {
      await access(binary);
    } catch {
      t.skip('Build Wisp.exe first');
      return;
    }
    const root = await mkdtemp(path.join(tmpdir(), 'wisp-vault-')),
      exe = path.join(root, 'Wisp.exe');
    await copyFile(binary, exe);
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    const suffix = hash(root),
      newDir = path.join(process.env.LOCALAPPDATA!, 'WispAI', 'Secrets', suffix),
      oldDir = path.join(process.env.LOCALAPPDATA!, 'WoWCompanion', 'Secrets', suffix),
      file = hash('test-rename') + '.bin';
    try {
      const vault = new WindowsVault(exe);
      await vault.write('test-rename', 'private-test-é');
      await mkdir(oldDir, { recursive: true });
      await rename(path.join(newDir, file), path.join(oldDir, file));
      await rm(path.join(newDir, '.renamed-from-companion'));
      assert.equal(await vault.read('test-rename'), 'private-test-é');
      assert.deepEqual(
        await readFile(path.join(newDir, file)),
        await readFile(path.join(oldDir, file)),
      );
      await vault.write('test-rename', '');
      assert.equal(await vault.read('test-rename'), '');
    } finally {
      for (const directory of [newDir, oldDir]) {
        assert.equal(path.basename(directory), suffix);
        assert.equal(path.basename(path.dirname(directory)), 'Secrets');
        assert.ok(directory.startsWith(path.resolve(process.env.LOCALAPPDATA!) + path.sep));
        await rm(directory, { recursive: true, force: true });
      }
      assert.ok(root.startsWith(path.join(tmpdir(), 'wisp-vault-')));
      await rm(root, { recursive: true, force: true });
    }
  },
);
