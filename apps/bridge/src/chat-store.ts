import { z } from 'zod';
import { chatSchema, type Chat } from './chat.ts';
import { isAutomaticEmptyChat } from './sessions.ts';
import { readJson, writeJson } from './json-file.ts';

export class ChatStore {
  private file: string;
  private onError: (error: unknown) => void;
  private queue: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private saved = '';
  private writable = false;
  constructor(file: string, onError: (error: unknown) => void) {
    this.file = file;
    this.onError = onError;
  }

  async load(): Promise<Chat[]> {
    const chats = await readJson(this.file, z.array(chatSchema), () => []);
    if (chats.some(isAutomaticEmptyChat)) {
      await writeJson(this.file.replace(/\.json$/, '.before-session-resume.json'), chats);
    }
    this.writable = true;
    return chats
      .filter((chat) => !isAutomaticEmptyChat(chat))
      .map((chat) => ({
        ...chat,
        lastActivityAt: chat.lastActivityAt ?? chat.lastUsedAt ?? 0,
        status: chat.status === 'working' ? 'interrupted' : chat.status,
        usage: chat.usage ? { ...chat.usage, compacting: false } : undefined,
      }));
  }

  // A bounded delay batches streaming deltas without waiting for an idle UI or game connection.
  schedule(snapshot: () => Chat[]) {
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush(snapshot()).catch(this.onError);
      }, 1000);
    }
  }

  async flush(chats: Chat[]) {
    if (!this.writable) {
      throw Error('Load conversations successfully before saving them.');
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    const content = JSON.stringify(chats);
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        if (content !== this.saved) {
          await writeJson(this.file, JSON.parse(content));
          this.saved = content;
        }
      });
    this.queue = work;
    await work;
  }
}
