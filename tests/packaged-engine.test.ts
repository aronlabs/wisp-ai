import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
test.runIf(Boolean(process.env.WISP_TEST_ENGINE_EXECUTABLE))(
  'packaged npm runs a local MCP executable without installing Node or extracting npm',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wisp-npx-test-'));
    try {
      const engine = path.join(root, 'wisp-engine.exe');
      await copyFile(process.env.WISP_TEST_ENGINE_EXECUTABLE!, engine);
      await mkdir(path.join(root, 'runtime'));
      await copyFile(process.execPath, path.join(root, 'runtime/node.exe'));
      const fixture = path.join(root, 'fixture');
      await mkdir(fixture);
      await writeFile(
        path.join(fixture, 'package.json'),
        JSON.stringify({
          name: 'wisp-mcp-fixture',
          version: '1.0.0',
          bin: { 'wisp-mcp-fixture': 'index.cjs' },
        }),
      );
      await writeFile(
        path.join(fixture, 'index.cjs'),
        '#!/usr/bin/env node\nconsole.log("wisp-mcp-fixture-ok")\n',
      );
      const env = {
        ...process.env,
        WISP_RESOURCE_ROOT: root,
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_offline: 'true',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        PATH:
          path.join(root, 'runtime') +
          path.delimiter +
          path.join(process.env.WINDIR || 'C:/Windows', 'System32'),
      };
      const result = await exec(
        engine,
        ['--npx', '--offline', '--yes', '--package', fixture, 'wisp-mcp-fixture'],
        { cwd: root, env, windowsHide: true, timeout: 45_000 },
      );
      expect(result.stdout).toContain('wisp-mcp-fixture-ok');
      const nodeCompatibility = await exec(engine, ['-e', 'console.log("wisp-node-shim-ok")'], {
        cwd: root,
        env,
        windowsHide: true,
        timeout: 10_000,
      });
      expect(nodeCompatibility.stdout).toContain('wisp-node-shim-ok');
      expect(await readdir(path.join(root, 'runtime'))).toEqual(['node.exe']);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);
