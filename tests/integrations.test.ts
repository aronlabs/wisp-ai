import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CapabilitySettings } from '@wisp/bridge/capabilities';
import { IntegrationState } from '../apps/bridge/src/integration-state.ts';
import { integrationContext, defaultCapabilities } from '@wisp/protocol/capabilities';
import { enabledTool } from '@wisp/agent/enabled-tool';
import { dynamicEvaluate } from '../node_modules/eve/dist/src/dynamic/definition.js';
const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

test('integration availability and master switches govern real Eve definitions and backend admission, preserving preferences', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wisp-integrations-'));
  const previous = process.env.WOW_CAPABILITIES_FILE;
  try {
    const settings = new CapabilitySettings(path.join(directory, 'choices.json'));
    settings.agentFile = path.join(directory, 'agent.json');
    process.env.WOW_CAPABILITIES_FILE = settings.agentFile;
    await settings.load();
    let now = 1000;
    const state = new IntegrationState(settings, () => now);
    const definition = { description: 'Questie lookup' };
    const resolve = dynamicEvaluate(enabledTool('find_npc_locations', definition));
    await settings.publish();
    assert.equal(await resolve({} as never), null, 'unreported addons are not offered');
    assert.equal(
      state.receive({
        version: '0.2',
        questie: { status: 'partial', trainers: false, services: false, version: '4' },
      }),
      true,
    );
    await settings.publish();
    assert.equal(await resolve({} as never), definition);
    assert.equal(settings.enabled('tool:find_npc_locations'), true);
    assert.equal(
      settings.snapshot().find((entry) => entry.id === 'integration:questie')?.status,
      'partial',
    );
    await settings.set('integration:questie', false);
    assert.equal(await resolve({} as never), null);
    assert.equal(
      settings.enabled('tool:find_npc_locations'),
      false,
      'RPC uses the same parent gate',
    );
    assert.equal(
      settings.snapshot().find((entry) => entry.id === 'tool:find_npc_locations')?.enabled,
      true,
    );
    await settings.set('tool:find_npc_locations', false);
    await settings.set('integration:questie', true);
    assert.equal(await resolve({} as never), null, 'master does not overwrite the child');
    await settings.set('tool:find_npc_locations', true);
    assert.equal(
      state.receive({
        version: '0.2',
        questie: { status: 'incompatible', trainers: false, services: false },
      }),
      true,
    );
    await settings.publish();
    assert.equal(await resolve({} as never), null);
    assert.equal(state.receive({ arbitrary: true }), false);
    state.receive({ version: '0.2', questie: { status: 'ready', trainers: true, services: true } });
    now += 180_001;
    state.refresh();
    await settings.publish();
    assert.equal(settings.enabled('tool:query_character'), false, 'stale game reports expire');
    assert.equal(await resolve({} as never), null);
    const persisted = JSON.parse(await readFile(settings.file, 'utf8'));
    assert.equal(
      persisted.enabled['tool:find_npc_locations'],
      true,
      'availability is not saved as a preference',
    );
    state.reset();
    assert.equal(settings.state('integration:questie').status, 'waiting');
    assert.equal(settings.enabled('unknown:tool'), false);
    assert.throws(() => enabledTool('unregistered', definition), /Unregistered/);
  } finally {
    if (previous === undefined) {
      delete process.env.WOW_CAPABILITIES_FILE;
    } else {
      process.env.WOW_CAPABILITIES_FILE = previous;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('every local tool belongs to one integration and exposes a unique namespaced identity', () => {
  const catalog = defaultCapabilities();
  const tools = catalog.filter((entry) => entry.id.startsWith('tool:'));
  assert.equal(new Set(tools.map((entry) => entry.toolName)).size, tools.length);
  for (const tool of tools) {
    assert.match(tool.toolName!, /^[a-z]+__[a-z_]+$/);
    assert.ok(catalog.some((entry) => entry.id === tool.parent && !entry.parent));
  }
});

test('Lua discovery distinguishes missing, wrong-version, partial and complete Questie providers', () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string) => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) {
      throw Error(to_jsstring(lua.lua_tolstring(L, -1)));
    }
  };
  run('C={}; C_AddOns={GetAddOnMetadata=function() return "test" end}');
  run(
    `assert(load(${JSON.stringify(readFileSync('addon/WispAI/Integrations.lua', 'utf8'))}))('WispAI',C)`,
  );
  run(`
    assert(C.IntegrationReport().questie.status=='missing')
    LibQuestieDB={flavor={expansion='Classic'},RequireContract=function()return true end,Npc={Get=function()end,Exists=function()end}}
    assert(C.IntegrationReport().questie.status=='incompatible')
    LibQuestieDB.flavor.expansion='Forever'
    assert(C.IntegrationReport().questie.status=='partial')
    Questie={IsForever=true}; QuestieLoader={ImportModule=function()error('not ready')end}
    assert(C.IntegrationReport().questie.status=='partial')
    QuestieLoader.ImportModule=function()return{GetClassTrainers=function()end,townsfolk={}}end
    assert(C.IntegrationReport().questie.status=='ready')
    LibQuestieDB.RequireContract=function()error('contract mismatch')end
    assert(C.IntegrationReport().questie.status=='incompatible')
  `);
});

test('integration context records disabled choices without leaking descriptions or external instructions', () => {
  const settings = new CapabilitySettings('unused');
  settings.flags['integration:questie'] = false;
  settings.flags['tool:inspect_target'] = false;
  const context = integrationContext(settings.snapshot());
  assert.equal(context.find((entry) => entry.id === 'integration:questie')?.enabled, false);
  assert.ok(
    context
      .find((entry) => entry.id === 'integration:wow')
      ?.disabledTools.includes('wow__inspect_target'),
  );
  assert.equal(JSON.stringify(context).includes('description'), false);
});
