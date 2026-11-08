import { test, expect, vi } from 'vitest';
import type { Client } from 'eve/client';
import { createPacketReceiver } from '@wisp/bridge/packet-receiver';
import { createSessionState } from '@wisp/bridge/session-state';
import { GameRequests } from '@wisp/bridge/game-requests';
import { CapabilitySettings } from '@wisp/bridge/capabilities';
import { IntegrationState } from '@wisp/bridge/integration-state';
import { MemoryStore } from '@wisp/bridge/memory-store';
import { RoutineStore } from '@wisp/bridge/routines';
import { PanelStore } from '@wisp/bridge/panels';
import { newChat } from '@wisp/bridge/chat-lifecycle';
import { packetSchema } from '@wisp/protocol/protocol';

function fixture() {
  const chat = { ...newChat('old', 'one'), eveId: 'eve', status: 'working' as const };
  const state = createSessionState([chat]);
  state.activeTransport = 'one';
  state.currentCharacterKey = 'old-character';
  state.inlineChat = 'old-inline';
  state.panelCommand = { seq: 1, id: 'panel', characterKey: 'old-character', action: 'show' };
  const pending = new GameRequests(() => {});
  const capabilitySettings = new CapabilitySettings('unused');
  const cancel = vi.fn(async () => {});
  const end = vi.fn(async () => {});
  const interrupt = vi.fn();
  const run = vi.fn(async () => {});
  const receive = createPacketReceiver({
    state,
    pending,
    capabilitySettings,
    integrationState: new IntegrationState(capabilitySettings),
    client: { sessions: { attach: () => ({ cancel, end }) } } as unknown as Pick<
      Client,
      'sessions'
    >,
    auth: { models: async () => [] },
    routineStore: new RoutineStore('unused'),
    panelStore: new PanelStore('unused'),
    memoryStore: new MemoryStore('unused'),
    transport: () => ({ resetSession: () => {}, setCursor: () => {} }),
    refreshModelCatalog: async () => {},
    setCapability: async () => {},
    memorySnapshot: async () => ({ status: 'available', entries: [] }),
    run,
    interrupt,
    runtime: 'unused',
    changed: () => {},
    log: () => {},
  });
  return { state, pending, receive, cancel, end, interrupt, run };
}

test('reload interrupts old turns, rejects outstanding reads and clears character-specific commands', async () => {
  const f = fixture();
  const request = f.pending.request({ chat: 'old', session: 'one' });
  const rejection = expect(request).rejects.toThrow('reloaded');
  f.receive(packetSchema.parse({ type: 'hello', session: 'two', seq: 1, at: 1 }));
  await rejection;
  expect(f.state.chats[0].status).toBe('interrupted');
  expect(f.cancel).toHaveBeenCalledTimes(1);
  expect(f.interrupt).toHaveBeenCalledTimes(1);
  expect(f.state.currentCharacterKey).toBeUndefined();
  expect(f.state.panelCommand).toBeUndefined();
  expect(f.state.inlineChat).toBe('');
  expect(f.pending.snapshot()).toEqual([]);
  f.receive(
    packetSchema.parse({ type: 'say', session: 'one', chat: 'old', text: 'stale', seq: 2, at: 2 }),
  );
  expect(f.run).not.toHaveBeenCalled();
});

test('deleting an active conversation cancels its requests and prevents delayed messages from recreating it', async () => {
  const f = fixture();
  const request = f.pending.request({ chat: 'old', session: 'one' });
  const rejection = expect(request).rejects.toThrow('deleted');
  f.receive(packetSchema.parse({ type: 'delete', session: 'one', chat: 'old', seq: 2, at: 2 }));
  await rejection;
  f.receive(
    packetSchema.parse({ type: 'say', session: 'one', chat: 'old', text: 'late', seq: 3, at: 3 }),
  );
  expect(f.state.chats).toEqual([]);
  expect(f.end).toHaveBeenCalledTimes(1);
  expect(f.run).not.toHaveBeenCalled();
});
