import { z } from 'zod';
export const rotationAction = z.strictObject({
  spellId: z.number().int().positive(),
  manaBelowPercent: z.number().min(0).max(100).optional(),
  manaAbovePercent: z.number().min(0).max(100).optional(),
  rageAbove: z.number().min(0).max(100).optional(),
  energyAbove: z.number().min(0).max(100).optional(),
  comboPointsAtLeast: z.number().int().min(1).max(5).optional(),
  dotRefreshBelowSeconds: z.number().min(0).max(30).optional(),
});
const rotationPlan = z.strictObject({
  label: z.string().trim().min(1).max(80),
  opener: z.array(rotationAction).max(8).default([]),
  priority: z.array(rotationAction).min(1).max(12),
});
export const simulationInput = z.strictObject({
  plans: z.array(rotationPlan).min(1).max(3),
  equipmentSets: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(80),
        replacements: z
          .array(
            z.strictObject({
              slot: z.number().int().min(1).max(18),
              itemId: z.number().int().nonnegative(),
            }),
          )
          .min(1)
          .max(17),
      }),
    )
    .max(2)
    .default([]),
  durationSeconds: z.number().int().min(10).max(180).default(30),
  iterations: z.number().int().min(100).max(2000).default(500),
  targetLevelOffset: z.number().int().min(-2).max(3).default(0),
  targetDistanceYards: z.number().min(5).max(30).optional(),
});
