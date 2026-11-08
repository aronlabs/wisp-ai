import { z } from 'zod';
export const rotationAction = z.strictObject({
  spellId: z.number().int().positive(),
  manaBelowPercent: z.number().min(0).max(100).optional(),
  manaAbovePercent: z.number().min(0).max(100).optional(),
});
const rotationPlan = z.strictObject({
  label: z.string().trim().min(1).max(80),
  opener: z.array(rotationAction).max(8).default([]),
  priority: z.array(rotationAction).min(1).max(12),
});
export const simulationInput = z.strictObject({
  plans: z.array(rotationPlan).min(1).max(3),
  durationSeconds: z.number().int().min(10).max(180).default(30),
  iterations: z.number().int().min(100).max(2000).default(500),
  targetLevelOffset: z.number().int().min(-2).max(3).default(0),
  targetDistanceYards: z.number().min(5).max(30).default(20),
});
