import { z } from 'zod';
import { readJson, writeJson } from './json-file.ts';
import { panelContent, panelInput, type Panel } from '@wisp/protocol/panels';
export class PanelStore {
  file: string;
  panels: Panel[] = [];
  queue: Promise<unknown> = Promise.resolve();
  constructor(file: string) {
    this.file = file;
  }
  async load() {
    this.panels = await readJson(
      this.file,
      z.array(panelContent.safeExtend({ characterKey: z.string().min(1), updatedAt: z.number() })),
      () => [],
    );
  }
  list(characterKey: string) {
    return this.panels.filter((p) => p.characterKey === characterKey);
  }
  async mutate(characterKey: string, input: z.infer<typeof panelInput>) {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        const next = this.panels.filter(
          (p) =>
            !(
              p.characterKey === characterKey &&
              p.id === (input.operation === 'save' ? input.panel.id : 'id' in input ? input.id : '')
            ),
        );
        if (input.operation === 'save') {
          if (next.filter((p) => p.characterKey === characterKey).length >= 12) {
            throw Error('Keep at most 12 panels per character');
          }
          next.push({ ...panelContent.parse(input.panel), characterKey, updatedAt: Date.now() });
        } else if (input.operation !== 'remove') {
          return;
        }
        await writeJson(this.file, next);
        this.panels = next;
      });
    this.queue = work;
    await work;
    return this.list(characterKey);
  }
}
