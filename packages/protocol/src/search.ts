import { z } from 'zod';
export const wowheadQuery = z.strictObject({
  query: z.string().trim().min(1).max(1000),
  depth: z
    .enum(['quick', 'standard', 'deep'])
    .default('standard')
    .describe(
      'Choose quick for a simple fact, standard for normal research, deep for conflicting evidence, missing acquisition routes or broad comparisons.',
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe('Maximum returned findings/sources. Overrides the depth default.'),
  maxQueries: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe(
      'Query budget including the primary query. Guidance for ChatGPT; bounds explicit query variants on Exa.',
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(10)
    .max(180)
    .optional()
    .describe('Total time budget for this tool call, not per query.'),
  excerptCharacters: z
    .number()
    .int()
    .min(1000)
    .max(12000)
    .optional()
    .describe('Maximum Exa excerpt length per source.'),
  queries: z
    .array(z.string().trim().min(1).max(1000))
    .max(5)
    .default([])
    .describe(
      'Optional additional focused query variants. Exa executes these within maxQueries; ChatGPT can use them as research directions.',
    ),
});
export type WebSearchInput = string | z.input<typeof wowheadQuery>;
const searchProfiles = {
  quick: {
    maxResults: 3,
    maxQueries: 1,
    timeoutSeconds: 35,
    excerptCharacters: 2000,
    reasoning: 'low',
  },
  standard: {
    maxResults: 5,
    maxQueries: 2,
    timeoutSeconds: 85,
    excerptCharacters: 4000,
    reasoning: 'low',
  },
  deep: {
    maxResults: 12,
    maxQueries: 4,
    timeoutSeconds: 160,
    excerptCharacters: 8000,
    reasoning: 'medium',
  },
} as const;
export function resolveWebSearch(raw: WebSearchInput) {
  const input = wowheadQuery.parse(typeof raw === 'string' ? { query: raw } : raw);
  const profile = searchProfiles[input.depth];
  return {
    query: input.query,
    queries: input.queries,
    depth: input.depth,
    maxResults: input.maxResults ?? profile.maxResults,
    maxQueries: input.maxQueries ?? profile.maxQueries,
    timeoutSeconds: input.timeoutSeconds ?? profile.timeoutSeconds,
    excerptCharacters: input.excerptCharacters ?? profile.excerptCharacters,
    reasoning: profile.reasoning,
  };
}
export const searchConfig = z.object({
  provider: z.enum(['auto', 'exa', 'chatgpt', 'disabled']).default('auto'),
});
export const searchSetup = searchConfig.extend({ apiKey: z.string().trim().max(4096).optional() });
export const searchState = searchConfig.extend({ hasExaKey: z.boolean() });
