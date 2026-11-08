import { z } from 'zod';

// This is the adapter boundary: new sources add an event and typed fields here,
// while routine behavior remains data composed by the agent.
export const routineEvents = {
  level_up: { native: 'PLAYER_LEVEL_UP', fields: { level: 'number' } },
  equipment_changed: {
    native: 'PLAYER_EQUIPMENT_CHANGED',
    fields: { slot: 'number', itemId: 'number' },
  },
  money_changed: { native: 'PLAYER_MONEY', fields: { copper: 'number' } },
  bags_changed: { native: 'BAG_UPDATE_DELAYED', fields: {} },
  quests_changed: { native: 'QUEST_LOG_UPDATE', fields: {} },
  spells_changed: { native: 'SPELLS_CHANGED', fields: {} },
  talents_changed: { native: 'PLAYER_TALENT_UPDATE', fields: {} },
  zone_changed: { native: 'ZONE_CHANGED_NEW_AREA', fields: { zone: 'string' } },
} as const;
export const routineEventName = z.enum(
  Object.keys(routineEvents) as [keyof typeof routineEvents, ...(keyof typeof routineEvents)[]],
);
const scalar = z.union([z.string().max(300), z.number().finite(), z.boolean()]);
const filter = z
  .object({
    field: z.string().min(1).max(40),
    op: z.enum(['eq', 'ne', 'gte', 'lte', 'contains', 'multiple_of']),
    value: scalar,
  })
  .strict();
export const routineTrigger = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('event'),
        event: routineEventName,
        filters: z.array(filter).max(8).default([]),
      })
      .strict(),
    z
      .object({ kind: z.literal('interval'), seconds: z.number().int().min(60).max(2592000) })
      .strict(),
  ])
  .superRefine((trigger, ctx) => {
    if (trigger.kind !== 'event') {
      return;
    }
    const fields = routineEvents[trigger.event].fields as Record<string, string>;
    for (const f of trigger.filters) {
      const type = fields[f.field];
      if (
        !type ||
        typeof f.value !== type ||
        (['gte', 'lte', 'multiple_of'].includes(f.op) && type !== 'number') ||
        (f.op === 'contains' && type !== 'string') ||
        (f.op === 'multiple_of' && (typeof f.value !== 'number' || f.value <= 0))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Unsupported field, value or operator for this event',
        });
      }
    }
  });
export const routineDefinition = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
    title: z.string().trim().min(1).max(100),
    instruction: z.string().trim().min(1).max(6000),
    triggers: z.array(routineTrigger).min(1).max(8),
    cooldownSeconds: z.number().int().min(60).max(86400).default(600),
    once: z
      .boolean()
      .default(false)
      .describe(
        'Pause after the first successful non-silent result. Silent checks and failures keep watching.',
      ),
  })
  .strict();
export const routineInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('catalog') }).strict(),
  z.object({ operation: z.literal('list') }).strict(),
  z.object({ operation: z.literal('get'), id: z.string() }).strict(),
  z.object({ operation: z.literal('save'), routine: routineDefinition }).strict(),
  z.object({ operation: z.literal('pause'), id: z.string() }).strict(),
  z.object({ operation: z.literal('resume'), id: z.string() }).strict(),
  z.object({ operation: z.literal('remove'), id: z.string() }).strict(),
]);
export const routineEvent = z
  .object({
    event: routineEventName,
    values: z.preprocess(
      (value) => (Array.isArray(value) && value.length === 0 ? {} : value),
      z.record(z.string().max(40), scalar).refine((v) => Object.keys(v).length <= 8),
    ),
  })
  .strict();
export type RoutineEvent = z.infer<typeof routineEvent>;
export type RoutineDefinition = z.infer<typeof routineDefinition>;
export function describeRoutineTrigger(trigger: RoutineDefinition['triggers'][number]): string {
  if (trigger.kind === 'interval') {
    return trigger.seconds % 3600 === 0
      ? `Every ${trigger.seconds / 3600} hours`
      : `Every ${trigger.seconds / 60} minutes`;
  }
  const labels: Record<keyof typeof routineEvents, string> = {
    level_up: 'On level up',
    equipment_changed: 'When equipment changes',
    money_changed: 'When money changes',
    bags_changed: 'When bags change',
    quests_changed: 'When quests change',
    spells_changed: 'When learned spells change',
    talents_changed: 'When talents change',
    zone_changed: 'When entering a zone',
  };
  const fields: Record<string, string> = {
    level: 'level',
    slot: 'equipment slot',
    itemId: 'item ID',
    copper: 'money in copper',
    zone: 'zone',
  };
  const operators = {
    eq: 'is',
    ne: 'is not',
    gte: 'is at least',
    lte: 'is at most',
    contains: 'contains',
    multiple_of: 'is a multiple of',
  };
  return (
    labels[trigger.event] +
    (trigger.filters.length
      ? ' · ' +
        trigger.filters.map((f) => `${fields[f.field]} ${operators[f.op]} ${f.value}`).join(' and ')
      : '')
  );
}
export const savedRoutine = routineDefinition.safeExtend({
  characterKey: z.string().min(1),
  sourceChatId: z.string().optional(),
  enabled: z.boolean(),
  updatedAt: z.number(),
  nextAt: z.number(),
  lastStartedAt: z.number().optional(),
  pending: z
    .object({ event: z.string(), values: z.record(z.string(), scalar), at: z.number() })
    .optional(),
});
export const routineRun = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1),
  characterKey: z.string().min(1),
  title: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  event: z.string(),
  status: z.enum(['running', 'done', 'no_tip', 'error', 'cancelled', 'interrupted']),
  summary: z.string().optional(),
});
export type Routine = z.infer<typeof savedRoutine>;
export type RoutineRun = z.infer<typeof routineRun>;
export function matchesRoutineEvent(
  trigger: z.infer<typeof routineTrigger>,
  event: RoutineEvent,
): boolean {
  return (
    trigger.kind === 'event' &&
    trigger.event === event.event &&
    trigger.filters.every((f) => {
      const value = event.values[f.field];
      if (typeof value !== typeof f.value) {
        return false;
      }
      switch (f.op) {
        case 'eq':
          return value === f.value;
        case 'ne':
          return value !== f.value;
        case 'gte':
          return typeof value === 'number' && value >= Number(f.value);
        case 'lte':
          return typeof value === 'number' && value <= Number(f.value);
        case 'contains':
          return typeof value === 'string' && value.includes(String(f.value));
        case 'multiple_of':
          return typeof value === 'number' && value % Number(f.value) === 0;
      }
    })
  );
}
