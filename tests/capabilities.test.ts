import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CapabilitySettings, capabilityEnabled, connectionTools } from '../src/capabilities.ts';
import { enabledTool } from '../src/enabled-tool.ts';
import { localMemory } from '../src/agent-memory.ts';
import { dynamicEvaluate } from '../node_modules/eve/dist/src/dynamic/definition.js';
import everloot from '../agent/connections/everloot.ts';
import { filterWebSearch } from '../src/model-tools.ts';

test('settings persist, filter real tool/MCP definitions, and preserve child settings when an MCP is off', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wow-wisp-capabilities-'));
  const previous = process.env.WOW_CAPABILITIES_FILE;
  try {
    const settings = new CapabilitySettings(path.join(directory, 'capabilities.json'));
    process.env.WOW_CAPABILITIES_FILE = settings.file;
    await settings.load();
    const definition = { description: 'target' };
    const resolve = dynamicEvaluate(enabledTool('inspect_target', definition));
    assert.equal(await resolve({} as never), definition);
    await Promise.all([settings.set('tool:inspect_target', false), settings.set('mcp_tool:everloot:market_value', false)]);
    assert.equal(await resolve({} as never), null, 'disabled tools must be removed from Eve, not only hidden in the UI');
    assert.equal(await capabilityEnabled('tool:inspect_target'), false);
    const connection = await dynamicEvaluate(everloot)({} as never);
    assert.ok(connection);
    assert.equal('allow' in connection.tools! && connection.tools.allow.includes('market_value'), false);
    assert.ok((await connectionTools('everloot', ['auction_history', 'market_value'])).includes('auction_history'));
    await settings.set('mcp:everloot', false);
    assert.equal(await dynamicEvaluate(everloot)({} as never), null);
    assert.equal(settings.snapshot().find(entry => entry.id === 'mcp_tool:everloot:auction_history')?.effective, false);
    await settings.set('mcp:everloot', true);
    assert.equal(settings.snapshot().find(entry => entry.id === 'mcp_tool:everloot:market_value')?.enabled, false);
    const restarted = new CapabilitySettings(settings.file); await restarted.load();
    assert.equal(restarted.enabled('tool:inspect_target'), false);
    await settings.set('memory:preferences', false);
    const memory = localMemory('preferences');
    assert.equal(await (memory.scope as any)({ session: { id: 'session' } }), null, 'disabled memory must not be recalled');
    await assert.rejects(settings.set('unknown:tool', false));
    await writeFile(settings.file, '{broken json');
    await assert.rejects(capabilityEnabled('tool:inspect_target'), 'corrupt settings must never silently re-enable tools');
  } finally {
    if (previous === undefined) delete process.env.WOW_CAPABILITIES_FILE; else process.env.WOW_CAPABILITIES_FILE = previous;
    assert.ok(directory.startsWith(path.join(tmpdir(), 'wow-wisp-capabilities-')));
    await rm(directory, { recursive: true, force: true });
  }
});
test('disabled native search is removed from model calls without affecting other tools', () => {
  const input = { prompt: [], tools: [{ type: 'provider' as const, id: 'openai.web_search' as const, name: 'web_search', args: {} }, { type: 'function' as const, name: 'query_character', inputSchema: {} }], toolChoice: { type: 'tool' as const, toolName: 'web_search' } };
  assert.equal(filterWebSearch(input, true), input);
  const filtered = filterWebSearch(input, false);
  assert.deepEqual(filtered.tools?.map(tool => tool.name), ['query_character']);
  assert.deepEqual(filtered.toolChoice, { type: 'auto' });
});
