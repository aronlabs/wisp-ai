import { test, expect } from 'vitest';
import { projectChats } from '@wisp/bridge/chat-projection';
import { newChat, openChat } from '@wisp/bridge/chat-lifecycle';
import { createSessionState } from '@wisp/bridge/session-state';
import { chatSchema } from '@wisp/bridge/chat';

test('routine conversations hide generated input while preserving answers and follow-up messages', () => {
  const state = createSessionState();
  const chat = newChat('run', 'session');
  chat.routineId = 'review';
  chat.proactive = true;
  chat.status = 'done';
  chat.messages = [
    { role: 'user', text: 'Run this routine. Trigger data: {"level":24}' },
    { role: 'assistant', text: 'Review your new spells.' },
  ];
  // Persisted runs without any new visibility metadata behave the same way.
  const restored = chatSchema.parse(JSON.parse(JSON.stringify(chat)));
  state.chats.push(restored);
  expect(projectChats(state).chats[0].messages?.map((m) => m.text)).toEqual([
    'Review your new spells.',
  ]);
  openChat(restored);
  state.activeChat = restored.id;
  restored.messages.push(
    { role: 'user', text: 'Which spell should I use?' },
    { role: 'assistant', text: 'Use Frostbolt.' },
  );
  const messages = projectChats(state).chats[0].messages!;
  expect(messages.map((m) => m.text)).toEqual([
    'Review your new spells.',
    'Which spell should I use?',
    'Use Frostbolt.',
  ]);
  expect(messages[0].id).toBe('run-message-1');
  expect(restored.messages).toHaveLength(4);
  expect(restored.messages[0].text).toContain('Trigger data:');
});

test('ordinary chats retain their initial user message', () => {
  const state = createSessionState();
  const chat = newChat('chat', 'session');
  chat.messages.push({ role: 'user', text: 'Help me with my rotation.' });
  state.chats.push(chat);
  state.activeChat = chat.id;
  expect(projectChats(state).chats[0].messages?.[0].text).toBe('Help me with my rotation.');
});
