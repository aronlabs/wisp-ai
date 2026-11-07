import { z } from 'zod';
import { readFile, writeFile, rename } from 'node:fs/promises';
export const adviceEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('level_up'), level: z.number().int().min(2).max(255) }),
  z.object({
    kind: z.literal('weapon'),
    itemId: z.number().int().positive(),
    slot: z.union([z.literal(16), z.literal(17), z.literal(18)]),
  }),
]);
export class AdviceGate {
  file: string;
  last: Record<string, number> = {};
  keys: string[] = [];
  constructor(file: string) {
    this.file = file;
  }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      this.last = raw.last || {};
      this.keys = raw.keys || [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
  }
  accept(
    identity: string,
    event: z.infer<typeof adviceEvent>,
    at: number,
    now: number,
    enabled: { levelUp: boolean; weapon: boolean },
    busy: boolean,
  ) {
    if (busy || now - at > 90000 || at > now + 5000 || !Number.isFinite(at)) {
      return false;
    }
    if (event.kind === 'level_up' ? !enabled.levelUp : !enabled.weapon) {
      return false;
    }
    const key = identity + ':' + JSON.stringify(event);
    if (this.keys.includes(key) || now - (this.last[identity] || 0) < 600000) {
      return false;
    }
    this.last[identity] = now;
    this.keys.push(key);
    this.keys = this.keys.slice(-150);
    return true;
  }
  async save() {
    const temporary = this.file + '.tmp';
    await writeFile(temporary, JSON.stringify({ last: this.last, keys: this.keys }));
    await rename(temporary, this.file);
  }
}
