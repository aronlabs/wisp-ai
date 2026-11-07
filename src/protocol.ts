// Framing derived from thott-bot/chat helper/outbox.go (GPL-3.0-only).
import { inflateSync } from 'node:zlib';
export const PREFIX = 'WispAI';
export const BIT_COUNT = 128;
export const SLOT_COUNT = 1024;
export interface Packet {
  type: string;
  session: string;
  seq: number;
  at: number;
  nextSlot?: number;
  receivedRev?: number;
  chat?: string;
  nextChat?: string;
  text?: string;
  messageId?: string;
  requestId?: string;
  data?: unknown;
  context?: unknown;
  slot?: string;
  key?: string;
  enabled?: boolean;
  heartbeat?: boolean;
  nodeId?: string;
  values?: unknown;
}
export function parseFrame(text: string): Buffer | null {
  const bytes = Buffer.alloc(16);
  const seen = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^WispAI_B(\d{3}):\s*(enabled|disabled)\s*$/.exec(line.trim());
    if (!m) {
      continue;
    }
    const i = Number(m[1]) - 1;
    if (i < 0 || i >= 128 || seen.has(i)) {
      return null;
    }
    seen.add(i);
    if (m[2] === 'enabled') {
      bytes[i >> 3] |= 0x80 >> (i % 8);
    }
  }
  return seen.size === 128 ? bytes : null;
}
export class FrameDecoder {
  last: Buffer | null = null;
  buffer: Buffer | null = null;
  baseline(frame: Buffer) {
    this.last = frame;
    this.buffer = null;
  }
  add(frame: Buffer): Packet | null {
    if (frame.length !== 16) {
      return null;
    }
    if (this.last?.equals(frame)) {
      return null;
    }
    if (this.last && (frame[0] & 127) !== ((this.last[0] + 1) & 127)) {
      this.buffer = null;
    }
    this.last = Buffer.from(frame);
    if (frame[0] & 128) {
      this.buffer = Buffer.from(frame.subarray(1));
    } else if (this.buffer) {
      this.buffer = Buffer.concat([this.buffer, frame.subarray(1)]);
    }
    if (!this.buffer || this.buffer.length < 2) {
      return null;
    }
    const size = this.buffer.readUInt16BE();
    if (this.buffer.length < size + 2) {
      return null;
    }
    const data = this.buffer.subarray(2, size + 2);
    this.buffer = null;
    try {
      const packet = JSON.parse(
        inflateSync(data, { maxOutputLength: 1024 * 1024 }).toString('utf8'),
      );
      if (
        !packet ||
        typeof packet.type !== 'string' ||
        typeof packet.session !== 'string' ||
        packet.session.length > 100 ||
        !Number.isSafeInteger(packet.seq) ||
        packet.seq < 1 ||
        !Number.isSafeInteger(packet.at)
      ) {
        return null;
      }
      return packet;
    } catch {
      return null;
    }
  }
}
export function luaJson(json: string): string {
  let eq = '=';
  while (json.includes(']' + eq + ']')) {
    eq += '=';
  }
  return `WispAI_Receive([${eq}[${json}]${eq}])\n`;
}
