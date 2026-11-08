import { z } from 'zod';
export const wowheadQuery = z.strictObject({ query: z.string().trim().min(1).max(300) });
