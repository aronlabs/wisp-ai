import { defineAgent } from 'eve';
import { createOpenAI } from '@ai-sdk/openai';
import { capabilityEnabled } from '../src/capabilities.ts';
import { filterWebSearch, subscriptionCallOptions } from '../src/model-tools.ts';
import { normalizeModelError } from '../src/model-errors.ts';
import { COMPACTION_THRESHOLD } from '../src/context-usage.ts';
// Only the bridge owns account credentials; Eve receives a loopback token.
const provider = createOpenAI({
  apiKey: 'wisp-loopback',
  baseURL: 'http://127.0.0.1:43187/model',
  fetch: async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.origin !== 'http://127.0.0.1:43187' || url.pathname !== '/model/responses') {
      throw Error('Unsupported model route');
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', 'Bearer ' + process.env.WOW_BRIDGE_TOKEN);
    return normalizeModelError(await fetch(input, { ...init, headers }));
  },
});
const base = provider.responses((process.env.WOW_MODEL || 'gpt-6-luna').replace(/^openai\//, ''));
type Options = Parameters<typeof base.doStream>[0];
const model = {
  ...base,
  provider: base.provider,
  modelId: base.modelId,
  specificationVersion: base.specificationVersion,
  get supportedUrls() {
    return base.supportedUrls;
  },
  doStream: async (options: Options) =>
    base.doStream(
      filterWebSearch(
        subscriptionCallOptions(options),
        await capabilityEnabled('tool:web_search'),
      ) as Options,
    ),
  doGenerate: async (options: Options) =>
    base.doGenerate(
      filterWebSearch(
        subscriptionCallOptions(options),
        await capabilityEnabled('tool:web_search'),
      ) as Options,
    ),
};
export default defineAgent({
  model,
  reasoning: 'medium',
  defaultTools: false,
  compaction: { threshold: COMPACTION_THRESHOLD },
});
