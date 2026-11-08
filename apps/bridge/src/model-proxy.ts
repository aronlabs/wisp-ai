import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readCompletedResponse } from './response-stream.ts';
import type { ChatGPTAuth } from './chatgpt-auth.ts';
export async function proxyModel(req: IncomingMessage, res: ServerResponse, auth: ChatGPTAuth) {
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abort.abort();
    }
  });
  req.setEncoding('utf8');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8 * 1024 * 1024) {
      throw Error('Model request is too large');
    }
  }
  const body = JSON.parse(raw);
  if (!body || typeof body !== 'object' || typeof body.model !== 'string') {
    throw Error('Invalid model request');
  }
  if (!(await auth.models()).some((m) => m.slug === body.model)) {
    throw Error('Choose an available model in Wisp > ChatGPT.');
  }
  const streaming = body.stream === true;
  body.store = false;
  body.stream = true;
  const response = await auth.authorized('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]),
  });
  if (response.ok && !streaming) {
    const completed = await readCompletedResponse(response);
    res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(completed));
    return;
  }
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || 'application/json',
    'cache-control': 'no-store',
  });
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body as never), res);
}
