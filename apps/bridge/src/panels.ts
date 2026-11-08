import { z } from 'zod';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { panelContent, panelInput, type Panel } from '@wisp/protocol/panels';
export class PanelStore {
  file: string;
  panels: Panel[] = [];
  queue: Promise<unknown> = Promise.resolve();
  constructor(file: string) {
    this.file = file;
  }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(raw)) {
        throw Error('Invalid panels file');
      }
      this.panels = raw.map((p) => ({
        ...panelContent.parse(p),
        characterKey: z.string().min(1).parse(p.characterKey),
        updatedAt: z.number().parse(p.updatedAt),
      }));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw e;
      }
    }
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
        await mkdir(path.dirname(this.file), { recursive: true });
        const temporary = this.file + '.' + randomUUID() + '.tmp';
        await writeFile(temporary, JSON.stringify(next, null, 2));
        await rename(temporary, this.file);
        this.panels = next;
      });
    this.queue = work;
    await work;
    return this.list(characterKey);
  }
}
