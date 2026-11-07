import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { appPaths, prepareEngine } from '../src/app-paths.ts';
import { migrateDesktop } from '../src/desktop-migration.ts';
test('installed resources stay separate from writable engine and conversation state', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-paths-'));
  try {
    const root = path.join(temporary, 'resources'),
      data = path.join(temporary, 'user');
    for (const name of ['src', 'agent', 'node_modules']) {
      await mkdir(path.join(root, name), { recursive: true });
    }
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(root, 'agent/agent.ts'), 'first');
    const paths = appPaths(root, data);
    await prepareEngine(root, paths.engine);
    await mkdir(path.join(paths.engine, '.eve'));
    await writeFile(path.join(paths.engine, '.eve/history'), 'keep');
    await writeFile(path.join(root, 'agent/agent.ts'), 'updated');
    await prepareEngine(root, paths.engine);
    assert.equal(await readFile(path.join(paths.engine, 'agent/agent.ts'), 'utf8'), 'updated');
    assert.equal(await readFile(path.join(paths.engine, '.eve/history'), 'utf8'), 'keep');
    assert.equal(
      await realpath(path.join(paths.engine, 'node_modules')),
      await realpath(path.join(root, 'node_modules')),
    );
    assert.equal(paths.config, path.join(data, 'config.local.json'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
test('migration imports explicit user data, leaves the old installation intact and refuses to overwrite', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-migrate-'));
  try {
    const source = path.join(temporary, 'old'),
      destination = path.join(temporary, 'new');
    await mkdir(path.join(source, 'runtime/memory'), { recursive: true });
    await writeFile(
      path.join(source, 'config.local.json'),
      JSON.stringify({ wow: 'test-wow', model: 'luna' }),
    );
    await writeFile(path.join(source, 'runtime/chats.json'), '["existing chat"]');
    await writeFile(path.join(source, 'runtime/desktop.json'), 'private session identity');
    await migrateDesktop(source, destination, '');
    assert.deepEqual(
      JSON.parse(await readFile(path.join(destination, 'runtime/chats.json'), 'utf8')),
      ['existing chat'],
    );
    assert.equal(
      await readFile(path.join(source, 'runtime/chats.json'), 'utf8'),
      '["existing chat"]',
    );
    await assert.rejects(readFile(path.join(destination, 'runtime/desktop.json')), /ENOENT/);
    await assert.rejects(migrateDesktop(source, destination, ''), /already configured/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
