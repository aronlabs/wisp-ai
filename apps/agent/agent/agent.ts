import { defineAgent, defineDynamic } from 'eve';
import { createOpenAI } from '@ai-sdk/openai';
import { capabilityEnabled } from '@wisp/agent/capabilities';
import { filterWebSearch, subscriptionCallOptions } from '@wisp/agent/model-tools';
import { normalizeModelError } from '@wisp/protocol/model-errors';
import { COMPACTION_THRESHOLD } from '@wisp/protocol/context-usage';
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
function subscriptionModel(id: string) {
  const base = provider.responses(id);
  type Options = Parameters<typeof base.doStream>[0];
  return {
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
}
export default defineAgent({
  model: defineDynamic(async (ctx) => {
    const response = await fetch(
      'http://127.0.0.1:43187/session-model?session=' + encodeURIComponent(ctx.session.id),
      {
        headers: { authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw Error('Could not load model settings for this conversation.');
    }
    const selected = (await response.json()) as {
      model: string;
      effort: string;
      contextWindow?: number;
    };
    const openai: Record<string, string> =
      selected.effort === 'provider-default' ? {} : { reasoningEffort: selected.effort };
    return {
      model: subscriptionModel(selected.model),
      reasoning: 'provider-default' as const,
      modelContextWindowTokens: selected.contextWindow,
      modelOptions: {
        providerOptions: {
          openai,
        },
      },
    };
  }),
  defaultTools: false,
  compaction: { threshold: COMPACTION_THRESHOLD },
});
