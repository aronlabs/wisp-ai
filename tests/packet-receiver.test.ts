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
import type { AccountModel } from '@wisp/bridge/chat-model';

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
  const models = vi.fn(async (): Promise<AccountModel[]> => []);
  const receive = createPacketReceiver({
    state,
    pending,
    capabilitySettings,
    integrationState: new IntegrationState(capabilitySettings),
    client: { sessions: { attach: () => ({ cancel, end }) } } as unknown as Pick<
      Client,
      'sessions'
    >,
    models: { models },
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
  return { state, pending, receive, cancel, end, interrupt, run, models };
}

test('changing native models resets provider history while preserving the visible chat', async () => {
  const f = fixture();
  const chat = f.state.chats[0]!;
  chat.status = 'done';
  chat.modelSettings = { model: 'chatgpt-model', effort: 'medium' };
  chat.messages.push({ role: 'user', text: 'Keep this conversation' });
  const first = 'connection:35302f8c-128a-48fb-98a1-9eb03bb71f72:anthropic/claude';
  const second = 'connection:35302f8c-128a-48fb-98a1-9eb03bb71f72:google/gemini';
  f.models.mockResolvedValue(
    [first, second].map((slug) => ({ slug, displayName: slug, efforts: [] })),
  );
  f.receive(
    packetSchema.parse({
      type: 'chat_model_set',
      requestId: 'model-change',
      session: 'one',
      seq: 1,
      at: 1,
      chat: 'old',
      data: { model: first },
    }),
  );
  await vi.waitFor(() => expect(chat.modelSettings?.model).toBe(first));
  expect(chat.eveId).toBeUndefined();
  expect(chat.messages[0]?.text).toBe('Keep this conversation');
  chat.eveId = 'native-session';
  f.receive(
    packetSchema.parse({
      type: 'chat_model_set',
      requestId: 'model-change',
      session: 'one',
      seq: 2,
      at: 2,
      chat: 'old',
      data: { model: second },
    }),
  );
  await vi.waitFor(() => expect(chat.modelSettings?.model).toBe(second));
  expect(chat.eveId).toBeUndefined();
  expect(f.end).toHaveBeenCalledTimes(2);
});

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
