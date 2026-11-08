import { selectedModel } from '@wisp/protocol/agent-rpc';
import { bridgeOrigin } from '@wisp/agent/agent-rpc';
import { defineAgent, defineDynamic } from 'eve';
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import { capabilityEnabled } from '@wisp/agent/capabilities';
import { filterWebSearch, subscriptionCallOptions } from '@wisp/agent/model-tools';
import { normalizeModelError } from '@wisp/protocol/model-errors';
import { COMPACTION_THRESHOLD } from '@wisp/protocol/context-usage';
// Only the bridge owns account credentials; Eve receives a loopback token.
const origin = bridgeOrigin();
const provider = createOpenAI({
  apiKey: 'wisp-loopback',
  baseURL: origin + '/model',
  fetch: async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.origin !== origin || url.pathname !== '/model/responses') {
      throw Error('Unsupported model route');
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', 'Bearer ' + process.env.WOW_BRIDGE_TOKEN);
    return normalizeModelError(await fetch(input, { ...init, headers }));
  },
});
function subscriptionModel(id: string) {
  return wrapLanguageModel({
    model: provider.responses(id),
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) =>
        filterWebSearch(
          subscriptionCallOptions(params),
          await capabilityEnabled('tool:web_search'),
        ),
    },
  });
}
export default defineAgent({
  model: defineDynamic(async (ctx) => {
    const response = await fetch(
      origin + '/session-model?session=' + encodeURIComponent(ctx.session.id),
      {
        headers: { authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw Error('Could not load model settings for this conversation.');
    }
    const selected = selectedModel.parse(await response.json());
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
