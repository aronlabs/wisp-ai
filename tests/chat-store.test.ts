import { test, expect, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChatStore } from '@wisp/bridge/chat-store';
import { newChat } from '@wisp/bridge/chat-lifecycle';

test('invalid JSON and invalid nested messages preserve the entire conversation file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-chats-'));
  const file = path.join(root, 'chats.json');
  try {
    for (const original of [
      '{broken',
      JSON.stringify([
        newChat('valid', 'game'),
        { ...newChat('invalid', 'game'), messages: [{ role: 'assistant', text: 42 }] },
      ]),
    ]) {
      await writeFile(file, original);
      const store = new ChatStore(file, () => {});
      await expect(store.load()).rejects.toThrow('preserved');
      await expect(store.flush([])).rejects.toThrow('Load conversations');
      expect(await readFile(file, 'utf8')).toBe(original);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restart interrupts active turns and ordered saves keep the latest complete snapshot', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-chats-'));
  const file = path.join(root, 'chats.json');
  try {
    await writeFile(file, JSON.stringify([{ ...newChat('chat', 'game'), status: 'working' }]));
    const store = new ChatStore(file, () => {});
    const chats = await store.load();
    expect(chats[0].status).toBe('interrupted');
    const first = store.flush(chats);
    chats[0].title = 'Latest';
    await Promise.all([first, store.flush(chats)]);
    expect(JSON.parse(await readFile(file, 'utf8'))[0].title).toBe('Latest');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('streaming changes are batched and saved without a connected game', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wisp-chats-'));
  const file = path.join(root, 'chats.json');
  try {
    const store = new ChatStore(file, (error) => {
      throw error;
    });
    await store.load();
    const chats = [newChat('chat', '')];
    vi.useFakeTimers();
    store.schedule(() => chats);
    chats[0].title = 'Updated during streaming';
    store.schedule(() => chats);
    await vi.advanceTimersByTimeAsync(1000);
    await store.flush(chats);
    expect(JSON.parse(await readFile(file, 'utf8'))[0].title).toBe(chats[0].title);
  } finally {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  }
});
