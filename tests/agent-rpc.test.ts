import { test, expect, vi, afterEach } from 'vitest';
import { agentRPC } from '@wisp/agent/agent-rpc';
import { rpcRequests } from '@wisp/protocol/agent-rpc';
afterEach(() => vi.unstubAllGlobals());
test('strict domain schemas accept their RPC session envelope without accepting unrelated fields', () => {
  const search = { eveSession: 'session', operation: 'search', kind: 'spell', query: 'Frost Nova' };
  expect(rpcRequests.database.parse(search).eveSession).toBe('session');
  expect(
    rpcRequests.database.parse({ eveSession: 'session', operation: 'get', kind: 'spell', id: 122 })
      .operation,
  ).toBe('get');
  expect(rpcRequests.wowhead.parse({ eveSession: 'session', query: 'Mage guide' }).query).toBe(
    'Mage guide',
  );
  expect(
    rpcRequests.simulate.parse({
      eveSession: 'session',
      plans: [{ label: 'Test', priority: [{ spellId: 116 }] }],
    }).iterations,
  ).toBe(500);
  expect(rpcRequests.database.safeParse({ ...search, arbitraryCode: 'bad' }).success).toBe(false);
});

test('RPC validates inputs and memory responses instead of trusting JSON casts', async () => {
  const fetch = vi.fn(async () => Response.json({ entries: [{ key: 'plan', text: 42 }] }));
  vi.stubGlobal('fetch', fetch);
  await expect(
    agentRPC('memory', { eveSession: 'session', slot: 'character', operation: 'list' }),
  ).rejects.toThrow();
  await expect(agentRPC('state', { eveSession: 'session', sections: [] })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('RPC preserves caller cancellation alongside its timeout', async () => {
  const abort = new AbortController();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      signal = init.signal;
      return Response.json({ characterKey: null });
    }),
  );
  expect(await agentRPC('identity', { eveSession: 'session' }, abort.signal)).toEqual({
    characterKey: null,
  });
  abort.abort();
  expect(signal?.aborted).toBe(true);
});
