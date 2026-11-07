import type { Chat } from './events.ts';
import { linkedReferences } from './references.ts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const fields = {
  character: ['name', 'realm', 'level', 'class', 'race', 'faction', 'game', 'version', 'build'],
  location: ['zone', 'subzone', 'mapId', 'x', 'y'],
} as const;
export function basicGameContext(value: unknown) {
  const input = record(value), sections = record(input.sections);
  const output: Record<string, unknown> = {};
  for (const name of ['character', 'location'] as const) {
    const section = record(sections[name]), data = record(section.data);
    output[name] = section.status === 'available'
      ? { status: 'available', data: Object.fromEntries(fields[name].filter(key => ['string', 'number'].includes(typeof data[key])).map(key => [key, data[key]])) }
      : { status: 'unavailable', error: 'No fresh addon reading was supplied for this message. Query this section if needed.' };
  }
  return { capturedAt: typeof input.capturedAt === 'number' ? input.capturedAt : undefined, source: 'WoW addon live API', sections: output };
}
export function characterIdentity(value: unknown): string | undefined {
  const sections = record(record(value).sections), section = record(sections.character), data = record(section.data);
  if (section.status !== 'available' || typeof data.name !== 'string' || !data.name || typeof data.realm !== 'string' || !data.realm) return;
  return JSON.stringify([data.game || 'WoW Forever', data.realm, data.name]);
}
// JSON escapes the tag delimiters so user text and game strings cannot close a block.
function tagged(name: string, data: unknown) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<${name}>\n${json}\n</${name}>`;
}
export function turnInput(text: string, context: unknown, chat: Pick<Chat, 'id' | 'title' | 'titleGenerated' | 'lastUIResult' | 'proactive'>) {
  const references = linkedReferences(text);
  return [tagged('game_context', basicGameContext(context)),
    tagged('conversation_context', { id: chat.id, title: chat.title, needsTitle: !chat.titleGenerated, automatic: chat.proactive===true }),
    ...(references.length ? [tagged('linked_references', references)] : []),
    ...(chat.lastUIResult ? [tagged('last_ui_result', chat.lastUIResult)] : []),
    tagged('user_message', text)].join('\n\n');
}
export function visibleUserText(input: string) {
  const match = /^<game_context>\n[^\n]*\n<\/game_context>\n\n<conversation_context>\n[^\n]*\n<\/conversation_context>\n\n(?:<linked_references>\n[^\n]*\n<\/linked_references>\n\n)?(?:<last_ui_result>\n[^\n]*\n<\/last_ui_result>\n\n)?<user_message>\n([^\n]*)\n<\/user_message>$/.exec(input);
  if (match) { try { const value = JSON.parse(match[1]); if (typeof value === 'string') return value; } catch {} }
  return input;
}
export function conversationTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const title = [...value.replace(/[|`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, 60).join('');
  return title || undefined;
}
