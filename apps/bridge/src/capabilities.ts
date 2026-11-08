import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultCapabilities, type Capability } from '@wisp/protocol/capabilities';
export async function readCapabilityFlags(file?: string): Promise<Record<string, boolean>> {
  if (!file) {
    return {};
  }
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (
      !data ||
      typeof data.enabled !== 'object' ||
      Array.isArray(data.enabled) ||
      data.enabled === null ||
      Object.values(data.enabled).some((value) => typeof value !== 'boolean')
    ) {
      throw new Error('Invalid capability settings; the file was preserved');
    }
    return data.enabled;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}
export class CapabilitySettings {
  file: string;
  catalog: Capability[];
  flags: Record<string, boolean> = {};
  queue: Promise<unknown> = Promise.resolve();
  constructor(file: string, catalog = defaultCapabilities()) {
    this.file = file;
    this.catalog = catalog;
  }
  async load() {
    this.flags = await readCapabilityFlags(this.file);
  }
  enabled(id: string) {
    const entry = this.catalog.find((entry) => entry.id === id);
    return this.flags[id] ?? entry?.defaultEnabled ?? true;
  }
  snapshot() {
    return this.catalog.map((entry) => ({
      ...entry,
      enabled: this.enabled(entry.id),
      effective: this.enabled(entry.id) && (!entry.parent || this.enabled(entry.parent)),
    }));
  }
  async set(id: string, enabled: boolean) {
    if (!this.catalog.some((entry) => entry.id === id) || typeof enabled !== 'boolean') {
      throw new Error('Unknown capability or invalid setting');
    }
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const next = { ...this.flags, [id]: enabled };
        await mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + '.' + randomUUID() + '.tmp';
        await writeFile(temp, JSON.stringify({ enabled: next }, null, 2));
        await rename(temp, this.file);
        this.flags = next;
      });
    this.queue = operation;
    await operation;
  }
}
