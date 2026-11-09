import { test, expect, vi } from 'vitest';
import type { Client } from 'eve/client';
import { createTurnRunner } from '@wisp/bridge/turn-runner';
import { newChat } from '@wisp/bridge/chat-lifecycle';

function fixture() {
  const chat = newChat('chat', 'one');
  let transport = 'one';
  let current = true;
  const send = vi.fn(async (_input: string) => ({
    stream: async function* (): AsyncGenerator<{ type: string; data: Record<string, unknown> }> {
      yield {
        type: 'content.delta',
        data: { partId: 'reply', kind: 'text', delta: '{"type":"text_delta","text":"Hello"}\n' },
      };
    },
    result: async () => ({ status: 'completed', sessionEnded: false }),
  }));
  const session = { id: 'eve', send };
  const client = {
    sessions: { create: vi.fn(async () => ({ session })), attach: () => session },
  } as unknown as Pick<Client, 'sessions'>;
  const models = vi.fn(async () => [{ slug: 'model', displayName: 'Model', efforts: ['medium'] }]);
  const log = vi.fn();
  const run = createTurnRunner({
    client,
    models: { models, prepare: async () => {} },
    capabilitySettings: { publish: async () => {}, enabled: () => true, snapshot: () => [] },
    currentTransport: () => transport,
    activeChat: () => 'chat',
    defaultModel: () => 'model',
    isReady: () => true,
    isStopping: () => false,
    accountBusy: () => false,
    isCurrent: () => current,
    changed: () => {},
    log,
  });
  return {
    chat,
    run,
    send,
    client,
    models,
    log,
    changeCharacter: () => {
      transport = 'two';
    },
    deleteChat: () => {
      current = false;
    },
  };
}

test('a complete turn projects streamed content and settles once', async () => {
  const f = fixture();
  await f.run(f.chat, 'Question');
  expect(f.chat.status).toBe('done');
  expect(
    f.chat.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text)
      .join(''),
  ).toBe('Hello');
  expect(f.send).toHaveBeenCalledTimes(1);
  await f.run.drain();
});

test.each(['character', 'delete'] as const)(
  'a %s change while resolving model settings cannot start an obsolete turn',
  async (change) => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.models.mockImplementationOnce(async () => {
      await gate;
      return [{ slug: 'model', displayName: 'Model', efforts: ['medium'] }];
    });
    const turn = f.run(f.chat, 'Question');
    await vi.waitFor(() => expect(f.models).toHaveBeenCalled());
    if (change === 'character') {
      f.changeCharacter();
    } else {
      f.deleteChat();
    }
    release();
    await turn;
    expect(f.send).not.toHaveBeenCalled();
    expect(f.chat.status).toBe('interrupted');
  },
);

test('interrupting a delivery aborts its stream and drains the runner', async () => {
  const f = fixture();
  let reading = false;
  f.send.mockResolvedValueOnce({
    stream: async function* (options?: { signal?: AbortSignal }) {
      reading = true;
      await new Promise<void>((_, reject) => {
        options!.signal!.addEventListener('abort', () => reject(Error('Read aborted')), {
          once: true,
        });
      });
      yield { type: 'unused', data: {} };
    },
    result: async () => ({ status: 'completed', sessionEnded: false }),
  });
  const turn = f.run(f.chat, 'Question');
  await vi.waitFor(() => expect(reading).toBe(true));
  f.run.interrupt(f.chat);
  await turn;
  await f.run.drain();
  expect(f.chat.status).toBe('interrupted');
});

test('retry after failure restores history without duplicating the user message', async () => {
  const f = fixture();
  await f.run(f.chat, 'Earlier question', 'earlier');
  f.send.mockRejectedValueOnce(new Error('Provider unavailable'));
  await f.run(f.chat, 'Explain that quest', 'failed');
  expect(f.chat.status).toBe('error');
  expect(f.chat.eveId).toBeUndefined();
  await f.run(f.chat, 'Explain that quest', 'failed');
  expect(f.chat.status).toBe('done');
  expect(f.chat.messages.filter((m) => m.id === 'failed')).toHaveLength(1);
  const input = f.send.mock.calls.at(-1)![0];
  expect(input).toContain('Earlier question');
  expect(input).toContain('Explain that quest');
  expect(f.client.sessions.create).toHaveBeenCalledTimes(2);
});

test('a follow-up after failure includes the failed question in restored history', async () => {
  const f = fixture();
  f.send.mockRejectedValueOnce(new Error('Provider unavailable'));
  await f.run(f.chat, 'Explain that quest', 'failed');
  await f.run(f.chat, 'Try that again', 'follow-up');
  expect(f.send.mock.calls.at(-1)![0]).toContain('Explain that quest');
});
