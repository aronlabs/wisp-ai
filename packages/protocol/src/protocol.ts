// Framing derived from thott-bot/chat helper/outbox.go (GPL-3.0-only).
import { inflateSync } from 'node:zlib';
import { z } from 'zod';
export const PREFIX = 'WispAI';
export const BIT_COUNT = 128;
export const SLOT_COUNT = 1024;
const identifier = z.string().min(1).max(200);
const envelope = z.object({
  session: z.string().min(1).max(100),
  seq: z.number().int().safe().positive(),
  at: z.number().int().safe(),
  nextSlot: z.number().int().min(1).max(SLOT_COUNT).optional(),
  receivedRev: z.number().int().nonnegative().optional(),
  chat: identifier.optional(),
  nextChat: identifier.optional(),
  text: z.string().max(16000).optional(),
  messageId: identifier.optional(),
  requestId: identifier.optional(),
  data: z.unknown().optional(),
  context: z.unknown().optional(),
  slot: z.enum(['preferences', 'character']).optional(),
  key: identifier.optional(),
  enabled: z.boolean().optional(),
  heartbeat: z.boolean().optional(),
  integrations: z.unknown().optional(),
  nodeId: identifier.optional(),
  values: z.unknown().optional(),
});
export const packetSchema = z.discriminatedUnion('type', [
  envelope.extend({
    type: z.enum(['hello', 'poll', 'model_catalog', 'capabilities_list', 'memory_list']),
  }),
  envelope.extend({
    type: z.enum(['new', 'select', 'delete', 'cancel', 'dismiss_tip', 'promote_inline']),
    chat: identifier,
  }),
  envelope.extend({
    type: z.enum(['say', 'inline_say']),
    chat: identifier,
    text: z.string().min(1).max(16000),
  }),
  envelope.extend({ type: z.literal('state_result'), requestId: identifier, chat: identifier }),
  envelope.extend({
    type: z.literal('capability_set'),
    key: identifier,
    enabled: z.boolean(),
    requestId: identifier,
  }),
  envelope.extend({
    type: z.enum(['memory_save', 'memory_remove']),
    slot: z.enum(['preferences', 'character']),
    key: identifier,
  }),
  envelope.extend({
    type: z.literal('chat_model_set'),
    chat: identifier,
    requestId: identifier,
    data: z.object({
      model: z.string().min(1),
      effort: z.string().optional(),
      inline: z.boolean().optional(),
    }),
  }),
  envelope.extend({ type: z.literal('inline_status'), data: z.record(z.string(), z.unknown()) }),
  envelope.extend({
    type: z.enum(['routine_tick', 'routine_event']),
    data: z.object({
      ready: z.boolean(),
      event: z.string().optional(),
      values: z.unknown().optional(),
    }),
  }),
  envelope.extend({ type: z.literal('routine_action'), data: z.unknown() }),
  envelope.extend({ type: z.literal('panel_ask'), key: identifier, nodeId: identifier }),
  envelope.extend({
    type: z.literal('ui_action'),
    chat: identifier,
    messageId: identifier,
    nodeId: identifier,
  }),
]);
export type Packet = z.infer<typeof packetSchema>;
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
      return packetSchema.parse(packet);
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
