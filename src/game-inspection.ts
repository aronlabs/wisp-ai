import { z } from 'zod';
import { settingsRead } from './settings.ts';
export const referenceInput = z.object({
  kind: z.enum(['item', 'spell', 'quest', 'talent']),
  id: z.number().int().positive(),
});
export const progressionInput = z.object({
  questIds: z.array(z.number().int().positive()).max(40).default([]),
  factionIds: z.array(z.number().int().positive()).max(20).default([]),
});
export const compareInput = z.object({
  itemIds: z.array(z.number().int().positive()).min(1).max(5),
  slot: z.number().int().min(1).max(19).optional(),
});
export const auctionInput = z.object({
  itemId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export const inspectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('settings'), args: settingsRead }),
  z.object({ kind: z.literal('reference'), args: referenceInput }),
  z.object({ kind: z.literal('progression'), args: progressionInput }),
  z.object({ kind: z.literal('compare_items'), args: compareInput }),
  z.object({ kind: z.literal('auctions'), args: auctionInput }),
  z.object({
    kind: z.literal('macros'),
    args: z.object({
      names: z.array(z.string().min(1).max(32)).max(10).default([]),
      includeBodies: z.boolean().default(false),
    }),
  }),
  z.object({
    kind: z.literal('map'),
    args: z.object({
      mapIds: z.array(z.number().int().positive()).max(20).default([]),
      query: z.string().min(1).max(80).optional(),
    }),
  }),
  ...(['target', 'trainer', 'resources'] as const).map((kind) =>
    z.object({ kind: z.literal(kind), args: z.object({}) }),
  ),
]);
