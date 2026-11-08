import { z } from 'zod';
import { readJson, writeJson } from './json-file.ts';
import { memoryEntry } from '@wisp/protocol/agent-rpc';
import { createHash } from 'node:crypto';
import path from 'node:path';
export type MemorySlot = 'preferences' | 'character';
export interface MemoryEntry {
  key: string;
  text: string;
  updatedAt: string;
}
export class MemoryStore {
  directory: string;
  queues = new Map<string, Promise<unknown>>();
  constructor(directory: string) {
    this.directory = directory;
  }
  file(slot: MemorySlot, owner: string) {
    return path.join(
      this.directory,
      createHash('sha256')
        .update(JSON.stringify([slot, owner]))
        .digest('hex') + '.json',
    );
  }
  async read(slot: MemorySlot, owner: string): Promise<MemoryEntry[]> {
    return (
      await readJson(this.file(slot, owner), z.object({ entries: z.array(memoryEntry) }), () => ({
        entries: [],
      }))
    ).entries;
  }

  async update(
    slot: MemorySlot,
    owner: string,
    key: string,
    text?: string,
  ): Promise<MemoryEntry[]> {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) {
      throw new Error('Memory keys must be short identifiers');
    }
    if (text !== undefined && (!text.trim() || text.length > 1000)) {
      throw new Error('Memory entries require 1–1000 characters');
    }
    const file = this.file(slot, owner);
    const operation = (this.queues.get(file) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const entries = (await this.read(slot, owner)).filter((entry) => entry.key !== key);
        if (text !== undefined) {
          entries.push({ key, text: text.trim(), updatedAt: new Date().toISOString() });
        }
        if (
          entries.length > 40 ||
          entries.reduce((size, entry) => size + entry.text.length, 0) > 6000
        ) {
          throw new Error('Memory is full; remove or shorten outdated entries first');
        }
        await writeJson(file, { slot, owner, entries });
        return entries;
      });
    this.queues.set(file, operation);
    try {
      return await operation;
    } finally {
      if (this.queues.get(file) === operation) {
        this.queues.delete(file);
      }
    }
  }
}
