import { z } from 'zod';
import { settingsRead } from './settings.ts';
export const npcLocationsInput = z
  .strictObject({
    mode: z.enum(['npc', 'class_trainers', 'services']).default('npc'),
    service: z
      .enum([
        'Transmogrifier',
        'Barber',
        'Banker',
        'Auctioneer',
        'Innkeeper',
        'Flight Master',
        'Repair',
        'Battlemaster',
        'Arcane Reforger',
        'Weapon Master',
      ])
      .optional(),
    npcId: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(80).optional(),
    class: z
      .enum([
        'MAGE',
        'WARRIOR',
        'PALADIN',
        'HUNTER',
        'ROGUE',
        'PRIEST',
        'SHAMAN',
        'WARLOCK',
        'DRUID',
      ])
      .optional(),
    mapId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .refine(
    (x) =>
      x.mode === 'services'
        ? x.service !== undefined
        : x.mode === 'class_trainers' || x.npcId !== undefined || x.name !== undefined,
    'Provide a service in services mode, an NPC name/ID, or class_trainers mode',
  );
export const questInput = z.strictObject({ questId: z.number().int().positive() });
export const questChainInput = z.strictObject({
  questId: z.number().int().positive(),
  direction: z.enum(['prerequisites', 'followups', 'both']).default('both'),
  maxDepth: z.number().int().min(1).max(4).default(2),
  limit: z.number().int().min(1).max(30).default(15),
});
export const objectLocationsInput = z
  .strictObject({
    objectId: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(80).optional(),
    mapId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .refine(
    (args) => args.objectId !== undefined || args.name !== undefined,
    'Provide an object ID or exact localized name',
  );
export const storedItemInput = z.strictObject({
  itemId: z.number().int().positive(),
  includeGuild: z.boolean().default(false),
  limit: z.number().int().min(1).max(40).default(20),
});
export const itemPricesInput = z.strictObject({
  itemIds: z.array(z.number().int().positive()).min(1).max(20),
});
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
  z.object({ kind: z.literal('questie_quest'), args: questInput }),
  z.object({ kind: z.literal('questie_chain'), args: questChainInput }),
  z.object({ kind: z.literal('object_locations'), args: objectLocationsInput }),
  z.object({ kind: z.literal('stored_item'), args: storedItemInput }),
  z.object({ kind: z.literal('item_prices'), args: itemPricesInput }),
  z.object({ kind: z.literal('npc_locations'), args: npcLocationsInput }),
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
