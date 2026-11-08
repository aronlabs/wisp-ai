import { z } from 'zod';
export const wowheadQuery = z.strictObject({ query: z.string().trim().min(1).max(300) });
export const searchConfig = z.object({
  provider: z.enum(['auto', 'exa', 'chatgpt', 'disabled']).default('auto'),
});
export const searchSetup = searchConfig.extend({ apiKey: z.string().trim().max(4096).optional() });
export const searchState = searchConfig.extend({ hasExaKey: z.boolean() });
