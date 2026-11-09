import { test, expect } from 'vitest';
import {
  isPublicSourceUrl,
  searchPublicWeb,
  verifiedWebResult,
} from '@wisp/bridge/public-web-search';
import type { ChatGPTAuth } from '@wisp/bridge/chatgpt-auth';
const url = 'https://github.com/fusionpit/WhatsTraining';
const response = {
  output: [
    { type: 'web_search_call', action: { sources: [{ url }] } },
    { content: [{ text: 'Catalog evidence', annotations: [{ type: 'url_citation', url }] }] },
  ],
};
test('ChatGPT searches globally with citations and explicit version instructions', async () => {
  let body: any;
  const auth = {
    authorized: async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(
        'data: ' + JSON.stringify({ type: 'response.completed', response }) + '\n\n',
      );
    },
  } as unknown as ChatGPTAuth;
  const result = await searchPublicWeb('Forever mage Invisibility training', auth, 'gpt-test');
  expect(body.tools).toEqual([{ type: 'web_search' }]);
  expect(body.input[0].content[0].text).toBe('Forever mage Invisibility training');
  expect(body.instructions).toContain('game version');
  expect(result).toMatchObject({ status: 'available', version: 'unspecified', sources: [{ url }] });
  expect(result.note).toContain('does not verify game version');
});
test('public source validation does not imply Forever and rejects local or credential URLs', () => {
  expect(isPublicSourceUrl(url)).toBe(true);
  expect(isPublicSourceUrl('https://www.wowhead.com/classic/spell=122')).toBe(true);
  for (const value of [
    'http://example.com',
    'https://localhost/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://user:secret@example.com/a',
  ]) {
    expect(isPublicSourceUrl(value)).toBe(false);
  }
  expect(
    verifiedWebResult({ output: [{ content: [{ text: 'Unsourced answer' }] }] }, 'query').status,
  ).toBe('unverified');
});
