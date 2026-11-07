import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCompletedResponse } from '../src/response-stream.ts';

function eventResponse(events: unknown[]): Response {
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        // Deliberately split Unicode characters and SSE lines across chunks.
        for (const byte of bytes) {
          controller.enqueue(new Uint8Array([byte]));
        }
        controller.close();
      },
    }),
  );
}

test('completed response collection preserves Unicode across arbitrary stream boundaries', async () => {
  const response = { id: 'test', output: [{ text: 'Varita mágica — 测试' }] };
  assert.deepEqual(
    await readCompletedResponse(
      eventResponse([
        { type: 'response.output_text.delta', delta: 'Varita' },
        { type: 'response.completed', response },
      ]),
    ),
    response,
  );
});

test('failed, incomplete and truncated streams never become completed responses', async () => {
  for (const type of ['response.failed', 'response.incomplete', 'error']) {
    await assert.rejects(
      () => readCompletedResponse(eventResponse([{ type }])),
      /did not complete/,
    );
  }
  await assert.rejects(
    () =>
      readCompletedResponse(
        eventResponse([{ type: 'response.output_text.delta', delta: 'Partial output' }]),
      ),
    /interrupted/,
  );
  await assert.rejects(() => readCompletedResponse(new Response(null)), /no response/);
});
