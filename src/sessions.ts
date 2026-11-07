import type { Chat } from './events.ts';
export function isAutomaticEmptyChat(chat: Chat): boolean {
  return (
    /^\d+-\d+-first$/.test(chat.id) &&
    chat.title === 'New conversation' &&
    !chat.eveId &&
    !chat.messages.length &&
    chat.status === 'idle'
  );
}
export function resumeChat(chats: Chat[], requested?: string): Chat | undefined {
  chats = chats.filter((chat) => !chat.inline && !chat.proactive);
  const saved = chats.find((c) => c.id === requested);
  if (saved) {
    return saved;
  }
  const populated = chats.filter((c) => c.messages.length > 0);
  return (
    populated.reduce<Chat | undefined>(
      (latest, chat) =>
        !latest || (chat.lastUsedAt || 0) >= (latest.lastUsedAt || 0) ? chat : latest,
      undefined,
    ) || chats.at(-1)
  );
}
