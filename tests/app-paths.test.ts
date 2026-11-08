import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, cp, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { appPaths, prepareEngine } from '@wisp/bridge/app-paths';
import { migrateDesktop } from '@wisp/bridge/desktop-migration';
import { createHash } from 'node:crypto';

test('packaged engine retires legacy source and dependencies while preserving Eve sessions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-engine-upgrade-'));
  const previous = process.env.WISP_ENGINE_EXECUTABLE;
  try {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@wisp/agent' }));
    for (const name of ['src', 'agent', 'dist', 'node_modules', '.eve']) {
      await mkdir(path.join(root, name));
      await writeFile(path.join(root, name, 'marker'), name);
    }
    process.env.WISP_ENGINE_EXECUTABLE = 'packaged-engine';
    await prepareEngine(root, root);
    assert.equal(await readFile(path.join(root, '.eve/marker'), 'utf8'), '.eve');
    for (const name of ['src', 'agent', 'dist', 'node_modules', 'package.json']) {
      await assert.rejects(readFile(path.join(root, name)), { code: 'ENOENT' });
    }
  } finally {
    if (previous === undefined) {
      delete process.env.WISP_ENGINE_EXECUTABLE;
    } else {
      process.env.WISP_ENGINE_EXECUTABLE = previous;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('the installed bridge can import native adapters from node_modules without TypeScript stripping', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-native-import-'));
  try {
    const source = appPaths(process.cwd()).agent;
    const installed = path.join(temporary, 'node_modules/@wisp/agent');
    await mkdir(installed, { recursive: true });
    await cp(path.join(source, 'dist'), path.join(installed, 'dist'), { recursive: true });
    await cp(path.join(source, 'package.json'), path.join(installed, 'package.json'));
    const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    for (const name of Object.keys(manifest.dependencies)) {
      const link = path.join(temporary, 'node_modules', name);
      await mkdir(path.dirname(link), { recursive: true });
      await symlink(
        await realpath(path.join(source, 'node_modules', name)),
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import {modelReasoningEfforts} from '@wisp/agent/reasoning';
      import {createProviderModel} from '@wisp/agent/providers';
      const model = createProviderModel('anthropic', 'claude-sonnet-4-6', {apiKey:'unused', baseURL:'http://127.0.0.1:1'});
      console.log(JSON.stringify({version:model.specificationVersion, efforts:modelReasoningEfforts('anthropic','claude-sonnet-4-6')}));
    `,
      ],
      { cwd: temporary, windowsHide: true },
    );
    assert.deepEqual(JSON.parse(stdout), {
      version: 'v4',
      efforts: ['none', 'low', 'medium', 'high'],
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
test('installed resources stay separate from writable engine and conversation state', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-paths-'));
  try {
    const root = path.join(temporary, 'resources'),
      data = path.join(temporary, 'user');
    for (const name of ['src', 'agent', 'dist', 'node_modules']) {
      await mkdir(path.join(root, name), { recursive: true });
    }
    await writeFile(
      path.join(root, 'package.json'),
      '{"dependencies":{"fixture-package":"1.0.0"}}',
    );
    await mkdir(path.join(root, 'node_modules/fixture-package'));
    await writeFile(path.join(root, 'agent/agent.ts'), 'first');
    await writeFile(path.join(root, 'dist/reasoning.js'), 'export const fixture = true;');
    const paths = appPaths(root, data);
    await prepareEngine(root, paths.engine);
    await mkdir(path.join(paths.engine, '.eve'));
    await writeFile(path.join(paths.engine, '.eve/history'), 'keep');
    await writeFile(path.join(root, 'agent/agent.ts'), 'updated');
    await writeFile(path.join(paths.engine, 'agent/retired-tool.ts'), 'old tool');
    await prepareEngine(root, paths.engine);
    assert.equal(await readFile(path.join(paths.engine, 'agent/agent.ts'), 'utf8'), 'updated');
    await assert.rejects(readFile(path.join(paths.engine, 'agent/retired-tool.ts')), /ENOENT/);
    assert.equal(await readFile(path.join(paths.engine, '.eve/history'), 'utf8'), 'keep');
    assert.equal(
      await readFile(path.join(paths.engine, 'dist/reasoning.js'), 'utf8'),
      'export const fixture = true;',
    );
    assert.equal(
      await realpath(path.join(paths.engine, 'node_modules/fixture-package')),
      await realpath(path.join(root, 'node_modules/fixture-package')),
    );
    assert.equal(paths.config, path.join(data, 'config.local.json'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
test('deployed agent uses its production dependency directory without losing Eve history', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-deployed-agent-'));
  try {
    const payload = path.join(temporary, 'payload');
    const agent = path.join(payload, 'node_modules/@wisp/agent');
    const engine = path.join(temporary, 'user/engine');
    await mkdir(path.join(agent, 'agent'), { recursive: true });
    await mkdir(path.join(agent, 'src'));
    await mkdir(path.join(agent, 'dist'));
    await writeFile(
      path.join(agent, 'package.json'),
      '{"name":"@wisp/agent","dependencies":{"fixture-package":"1.0.0"}}',
    );
    await mkdir(path.join(payload, 'node_modules/fixture-package'));
    await writeFile(path.join(agent, 'agent/agent.ts'), 'production definition');
    await mkdir(path.join(engine, '.eve'), { recursive: true });
    await writeFile(path.join(engine, '.eve/history'), 'existing sessions');
    await prepareEngine(agent, engine);
    assert.equal(
      await readFile(path.join(engine, 'agent/agent.ts'), 'utf8'),
      'production definition',
    );
    assert.equal(
      await realpath(path.join(engine, 'node_modules/fixture-package')),
      await realpath(path.join(payload, 'node_modules/fixture-package')),
    );
    assert.equal(await readFile(path.join(engine, '.eve/history'), 'utf8'), 'existing sessions');
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
test('migration preserves encrypted blobs and detaches old Eve session IDs', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'wisp-credentials-import-'));
  try {
    const source = path.join(temporary, 'old'),
      data = path.join(temporary, 'new'),
      local = path.join(temporary, 'LocalAppData');
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const secrets = path.join(local, 'WispAI', 'Secrets', hash(source));
    await mkdir(secrets, { recursive: true });
    await mkdir(path.join(source, 'runtime'), { recursive: true });
    await writeFile(path.join(source, 'config.local.json'), JSON.stringify({ wow: 'test-wow' }));
    await writeFile(
      path.join(source, 'runtime/chats.json'),
      JSON.stringify([
        {
          id: 'chat',
          eveId: 'old-session',
          status: 'working',
          messages: [{ role: 'user', text: 'Keep this' }],
        },
      ]),
    );
    const encrypted = Buffer.from([0, 1, 2, 3, 255, 128]);
    await writeFile(path.join(secrets, hash('auth') + '.bin'), encrypted);
    await migrateDesktop(source, data, local);
    assert.deepEqual(await readFile(path.join(data, 'secrets', hash('auth') + '.bin')), encrypted);
    const chats = JSON.parse(await readFile(path.join(data, 'runtime/chats.json'), 'utf8'));
    assert.equal(chats[0].eveId, undefined);
    assert.equal(chats[0].status, 'interrupted');
    assert.equal(chats[0].messages[0].text, 'Keep this');
    await rm(path.join(data, 'secrets', hash('auth') + '.bin'));
    await assert.rejects(migrateDesktop(source, data, local), /already configured/);
    await assert.rejects(readFile(path.join(data, 'secrets', hash('auth') + '.bin')), /ENOENT/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
