import type { Client } from 'eve/client';
import type { Chat } from './events.ts';
import { withConversationHistory } from './context.ts';
import { resetContextUsage } from './context-usage.ts';

export function isInactiveSession(error: unknown): boolean {
  return error instanceof Error && /session is no longer active/i.test(error.message);
}

// Retry only an explicit admission rejection. Never replay an accepted turn,
// which might already have performed a tool action before failing.
export async function sendChatTurn(client: Pick<Client, 'sessions'>, chat: Chat, input: string) {
  const resumed = Boolean(chat.eveId);
  if (!resumed) {
    resetContextUsage(chat);
  }
  let session = chat.eveId
    ? client.sessions.attach(chat.eveId)
    : (await client.sessions.create()).session;
  chat.eveId = session.id;
  try {
    return await session.send(resumed ? input : withConversationHistory(input, chat.messages));
  } catch (error) {
    if (!resumed || !isInactiveSession(error)) {
      throw error;
    }
    session = (await client.sessions.create()).session;
    resetContextUsage(chat);
    chat.eveId = session.id;
    return session.send(withConversationHistory(input, chat.messages));
  }
}
