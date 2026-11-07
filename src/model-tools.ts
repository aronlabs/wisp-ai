import type { createOpenAI } from '@ai-sdk/openai';
type CallOptions = Parameters<ReturnType<ReturnType<typeof createOpenAI>['responses']>['doStream']>[0];
export function filterWebSearch(options: CallOptions, enabled: boolean): CallOptions {
  if (enabled) return options;
  const blocked = (options.tools || []).filter(tool => tool.name === 'web_search' || (tool.type !== 'function' && /^openai\.web_search/.test(tool.id)));
  const names = new Set(blocked.map(tool => tool.name));
  // Filtering preserves the input model's tool version (v2/v3/v4).
  return { ...options, tools: options.tools?.filter(tool => !names.has(tool.name)),
    toolChoice: options.toolChoice?.type === 'tool' && names.has(options.toolChoice.toolName) ? { type: 'auto' } : options.toolChoice } as CallOptions;
}
