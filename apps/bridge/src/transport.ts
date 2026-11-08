import { watch } from 'node:fs';
import { readdir, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { FrameDecoder, parseFrame, luaJson, type Packet } from '@wisp/protocol/protocol';
export class DiskTransport {
  private scans?: Promise<void>;
  private reads = new Map<string, Promise<void>>();
  private onError: (error: unknown) => void;
  decoders = new Map<string, FrameDecoder>();
  seen = new Map<string, number>();
  stopped = false;
  published = '';
  timer?: ReturnType<typeof setInterval>;
  nextSlot = 1;
  peerRevision = 0;
  writing = Promise.resolve();
  watchers: ReturnType<typeof watch>[] = [];
  wow: string;
  receive: (packet: Packet) => void;
  constructor(
    wow: string,
    receive: (packet: Packet) => void,
    onError: (error: unknown) => void = console.error,
  ) {
    this.wow = wow;
    this.receive = receive;
    this.onError = onError;
  }
  async start() {
    await this.scan(true);
    this.timer = setInterval(() => {
      this.scans ??= this.scan(false)
        .catch(this.onError)
        .finally(() => {
          this.scans = undefined;
        });
    }, 1000);
  }
  async scan(baseline: boolean) {
    const account = path.join(this.wow, 'WTF', 'Account');
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4) {
        return;
      }
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(file, depth + 1);
        } else if (entry.name.toLowerCase() === 'addons.txt') {
          if (!this.decoders.has(file)) {
            this.decoders.set(file, new FrameDecoder());
            try {
              this.watchers.push(
                watch(dir, (_, name) => {
                  if (String(name).toLowerCase() === 'addons.txt') {
                    void this.read(file, false).catch(this.onError);
                  }
                }),
              );
            } catch (error) {
              this.onError(error);
            }
          }
          await this.read(file, baseline);
        }
      }
    };
    await walk(account, 0);
  }
  async read(file: string, baseline: boolean) {
    const work = (this.reads.get(file) || Promise.resolve())
      .catch(() => {})
      .then(() => this.readCurrent(file, baseline));
    this.reads.set(file, work);
    try {
      await work;
    } finally {
      if (this.reads.get(file) === work) {
        this.reads.delete(file);
      }
    }
  }
  private async readCurrent(file: string, baseline: boolean) {
    if (this.stopped) {
      return;
    }
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return;
    }
    const frame = parseFrame(text);
    if (!frame) {
      return;
    }
    const decoder = this.decoders.get(file);
    if (!decoder) {
      return;
    }
    if (baseline) {
      decoder.baseline(frame);
      return;
    }
    const packet = decoder.add(frame);
    if (!packet) {
      return;
    }
    const key = packet.session + ':' + packet.seq;
    if (this.seen.has(key)) {
      this.receive(packet);
      return;
    }
    this.seen.set(key, Date.now());
    for (const [id, at] of this.seen) {
      if (Date.now() - at > 3600_000) {
        this.seen.delete(id);
      }
    }
    this.receive(packet);
  }
  publish(snapshot: unknown) {
    const json = JSON.stringify(snapshot);
    if (json === this.published) {
      return this.writing;
    }
    this.published = json;
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        const file = path.join(this.wow, 'Interface', 'AddOns', 'WispAI_Payload', 'Payload.lua');
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        await writeFile(tmp, luaJson(json), 'utf8');
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(tmp, file);
            break;
          } catch (error) {
            if (attempt >= 5) {
              throw error;
            }
            await new Promise((r) => setTimeout(r, 30));
          }
        }
      })
      .catch((error) => {
        if (this.published === json) {
          this.published = '';
        }
        throw error;
      });
    return this.writing;
  }
  setCursor(slot: number, receivedRevision: number) {
    this.nextSlot = Math.max(this.nextSlot, slot);
    this.peerRevision = Math.max(this.peerRevision, receivedRevision);
  }
  resetSession() {
    this.nextSlot = 1;
    this.peerRevision = 0;
    this.published = '';
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const w of this.watchers) {
      w.close();
    }
  }
}
