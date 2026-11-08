import { z } from 'zod';
import type { CapabilitySettings } from './capabilities.ts';
const reportSchema = z.object({
  version: z.string().max(80),
  questie: z.object({
    status: z.enum(['ready', 'partial', 'missing', 'incompatible']),
    version: z.string().max(80).optional(),
    trainers: z.boolean(),
    services: z.boolean(),
  }),
});
export class IntegrationState {
  lastSeen = 0;
  report?: z.infer<typeof reportSchema>;
  private settings: CapabilitySettings;
  private now: () => number;
  constructor(settings: CapabilitySettings, now = () => Date.now()) {
    this.settings = settings;
    this.now = now;
    this.refresh();
  }
  reset() {
    this.lastSeen = 0;
    this.report = undefined;
    this.refresh();
  }
  receive(value: unknown) {
    const result = reportSchema.safeParse(value);
    if (!result.success) {
      return false;
    }
    this.report = result.data;
    this.lastSeen = this.now();
    this.refresh();
    return true;
  }
  refresh() {
    const live = !!this.report && this.now() - this.lastSeen < 180_000;
    this.settings.availability.set('integration:wow', {
      available: live,
      status: live ? 'ready' : 'waiting',
      version: live ? this.report!.version : undefined,
      reason: live
        ? 'Connected to the game.'
        : 'Waiting for an integration report from WoW. Enter the game or reload Wisp.',
    });
    const q = live ? this.report!.questie : undefined;
    this.settings.availability.set('integration:questie', {
      available: !!q && ['ready', 'partial'].includes(q.status),
      status: q?.status || 'waiting',
      version: q?.version,
      reason: !q
        ? 'Waiting for WoW.'
        : q.status === 'missing'
          ? 'QuestieDB is not loaded.'
          : q.status === 'incompatible'
            ? 'QuestieDB Forever with contract 4 is required.'
            : q.status === 'partial'
              ? 'NPC reads available. Some trainer or service indexes are unavailable.'
              : 'Forever NPC locations, trainer and service indexes available.',
    });
  }
}
