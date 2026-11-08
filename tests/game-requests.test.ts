import { test, expect, vi } from 'vitest';
import { GameRequests } from '@wisp/bridge/game-requests';

test('responses are scoped to both transport session and conversation', async () => {
  const requests = new GameRequests(() => {});
  const result = requests.request({ chat: 'chat', session: 'one', inspection: { kind: 'target' } });
  const [{ id }] = requests.snapshot();
  expect(requests.receive(id, 'two', 'chat', { wrong: true })).toBe(false);
  expect(requests.receive(id, 'one', 'other', { wrong: true })).toBe(false);
  expect(requests.receive(id, 'one', 'chat', { correct: true })).toBe(true);
  expect(await result).toEqual({ correct: true });
  expect(requests.snapshot()).toEqual([]);
});

test('reload, deletion and HTTP cancellation reject requests and release their timers', async () => {
  const requests = new GameRequests(() => {});
  const reload = requests.request({ chat: 'a', session: 'one' });
  const deleted = requests.request({ chat: 'b', session: 'one' });
  const rejectedReload = expect(reload).rejects.toThrow('Reload');
  const rejectedDeleted = expect(deleted).rejects.toThrow('deleted');
  requests.cancelChat('b');
  requests.cancelAll('Reload');
  await Promise.all([rejectedReload, rejectedDeleted]);
  const abort = new AbortController();
  const cancelled = requests.request({ chat: 'c', session: 'two' }, abort.signal);
  const rejectedCancelled = expect(cancelled).rejects.toThrow('cancelled');
  abort.abort();
  await rejectedCancelled;
  expect(requests.snapshot()).toEqual([]);
});

test('timeout removes a request before a late game response can settle it', async () => {
  vi.useFakeTimers();
  try {
    const requests = new GameRequests(() => {});
    const result = requests.request({ chat: 'chat', session: 'one' }, undefined, 50);
    const rejected = expect(result).rejects.toThrow('did not respond');
    const [{ id }] = requests.snapshot();
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(requests.receive(id, 'one', 'chat', {})).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
