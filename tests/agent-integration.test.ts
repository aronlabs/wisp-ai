import { test, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'eve/client';
import { appPaths, prepareEngine } from '@wisp/bridge/app-paths';
import { startEveProcess, stopEveProcess } from '@wisp/bridge/agent-process';
import { defaultCapabilities } from '@wisp/protocol/capabilities';
import { newChat } from '@wisp/bridge/chat-lifecycle';
import { applyEvent } from '@wisp/bridge/events';
import { ReplyProjection } from '@wisp/bridge/reply-stream';

test(
  'the real Eve agent and AI SDK middleware complete an offline streamed turn',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wisp-agent-integration-'));
    const engine = path.join(root, 'engine');
    const flags = path.join(root, 'capabilities.json');
    await prepareEngine(process.env.WISP_TEST_AGENT_ROOT || appPaths(process.cwd()).agent, engine);
    await writeFile(
      flags,
      JSON.stringify({
        enabled: Object.fromEntries(
          defaultCapabilities().map((capability) => [capability.id, false]),
        ),
      }),
    );
    await writeFile(path.join(root, 'mcp.json'), '{"servers":{}}');
    const requests: Record<string, unknown>[] = [];
    const trace: unknown[] = [];
    const text = '{"type":"text_delta","text":"Offline integration passed."}\n';
    const model = createServer(async (req, res) => {
      if (req.url?.startsWith('/session-model?')) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            model: 'offline-test',
            effort: 'provider-default',
            contextWindow: 128000,
          }),
        );
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      requests.push(JSON.parse(body));
      const events = [
        {
          type: 'response.created',
          response: { id: 'offline-response', model: 'offline-test', created_at: 1 },
        },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: 'offline-message', type: 'message', role: 'assistant', content: [] },
        },
        {
          type: 'response.output_text.delta',
          item_id: 'offline-message',
          output_index: 0,
          delta: text,
        },
        { type: 'response.output_text.done', item_id: 'offline-message', output_index: 0, text },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: 'offline-message',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
        },
        {
          type: 'response.completed',
          response: {
            id: 'offline-response',
            model: 'offline-test',
            created_at: 1,
            output: [
              {
                id: 'offline-message',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text, annotations: [] }],
              },
            ],
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        },
      ];
      res
        .writeHead(200, { 'content-type': 'text/event-stream' })
        .end(events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
    });
    await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + (model.address() as { port: number }).port;
    const reserved = createServer();
    await new Promise<void>((resolve) => reserved.listen(0, '127.0.0.1', resolve));
    const port = (reserved.address() as { port: number }).port;
    await new Promise<void>((resolve) => reserved.close(() => resolve()));
    const log = await open(path.join(root, 'eve.log'), 'a');
    // Override the launch port while keeping the production process setup and environment.
    const child = startEveProcess({
      root: engine,
      logFile: log.fd,
      port,
      environment: {
        ...process.env,
        NODE_ENV: 'development',
        EVE_MOCK_AUTHORED_MODELS: '0',
        WOW_BRIDGE_TOKEN: 'offline-token',
        WOW_BRIDGE_URL: origin,
        WOW_CAPABILITIES_FILE: flags,
        WOW_MCP_CONFIG: path.join(root, 'mcp.json'),
      },
      onError: () => {},
      onExit: () => {},
    });
    const client = new Client({ baseUrl: 'http://127.0.0.1:' + port });
    try {
      await vi.waitFor(() => client.health(), { timeout: 40_000, interval: 200 });
      const session = (await client.sessions.create()).session;
      const delivery = await session.send('Reply with the supplied offline text.', {
        signal: AbortSignal.timeout(15000),
      });
      const chat = newChat('offline', 'test');
      const projection = new ReplyProjection();
      for await (const event of delivery.stream({ signal: AbortSignal.timeout(15000) })) {
        if (event.type.startsWith('content.')) {
          trace.push(event);
        }
        applyEvent(chat, event, projection);
      }
      projection.flush(chat, Date.now(), true);
      expect((await delivery.result()).status).toBe('completed');
      expect(chat.messages.map((message) => message.text)).toContain('Offline integration passed.');
      expect(requests.length).toBeGreaterThan(0);
      expect(
        requests.every((request) => request.store === false && !('safety_identifier' in request)),
      ).toBe(true);
    } catch (error) {
      throw new Error(
        'Offline agent integration failed: ' +
          JSON.stringify(trace) +
          '\n' +
          (await readFile(path.join(root, 'eve.log'), 'utf8')),
        { cause: error },
      );
    } finally {
      await stopEveProcess(child);
      await log.close();
      await new Promise<void>((resolve) => model.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
