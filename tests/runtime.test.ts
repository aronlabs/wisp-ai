import { test, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { startBridge, type BridgeOptions } from '@wisp/bridge/runtime';
import { packetSchema } from '@wisp/protocol/protocol';
import { statusSchema } from '@wisp/protocol/desktop';

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'wisp-runtime-'));
  await writeFile(
    path.join(dataDirectory, 'config.local.json'),
    JSON.stringify({ wow: path.join(dataDirectory, 'wow') }),
  );
  let child: ChildProcess | undefined;
  const options: BridgeOptions = {
    dataDirectory,
    agentPort: 0,
    desktopPort: 0,
    vault: { read: async () => '', write: async () => {} },
    client: {
      health: async () => {},
      info: async () => ({ agent: {} }),
      sessions: {},
    } as unknown as BridgeOptions['client'],
    startAgent: () => {
      child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return child;
    },
  };
  return { dataDirectory, options, child: () => child };
}

test('the assembled runtime serves validated status, receives packets, persists and stops its process', async () => {
  const f = await fixture();
  let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
  try {
    bridge = await startBridge(f.options);
    const identity = JSON.parse(
      await readFile(path.join(f.dataDirectory, 'runtime/desktop.json'), 'utf8'),
    );
    const response = await fetch(`http://127.0.0.1:${identity.port}/status`, {
      headers: { authorization: 'Bearer ' + identity.token },
    });
    expect(statusSchema.parse(await response.json()).auth.status).toBe('signed_out');
    bridge.receive(packetSchema.parse({ type: 'hello', session: 'test', seq: 1, at: 1 }));
    bridge.receive(
      packetSchema.parse({ type: 'new', session: 'test', chat: 'chat', seq: 2, at: 2 }),
    );
    await bridge.stop();
    const saved = JSON.parse(
      await readFile(path.join(f.dataDirectory, 'runtime/chats.json'), 'utf8'),
    );
    expect(saved.map((chat: { id: string }) => chat.id)).toContain('chat');
    await vi.waitFor(() => expect(f.child()?.exitCode).not.toBeNull());
    await bridge.stop();
  } finally {
    await bridge?.stop();
    await rm(f.dataDirectory, { recursive: true, force: true });
  }
});

test('a late startup failure closes the agent and already-started runtime resources', async () => {
  const f = await fixture();
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const port = (occupied.address() as { port: number }).port;
  try {
    await expect(startBridge({ ...f.options, desktopPort: port })).rejects.toThrow('EADDRINUSE');
    await vi.waitFor(() => expect(f.child()?.exitCode).not.toBeNull());
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await rm(f.dataDirectory, { recursive: true, force: true });
  }
});
