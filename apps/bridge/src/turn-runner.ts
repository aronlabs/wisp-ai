import type { Client } from 'eve/client';
import { applyEvent, type Chat } from './events.ts';
import { ReplyProjection } from './reply-stream.ts';
import { sendChatTurn } from './agent-session.ts';
import { beginTurn, settleTurn } from './chat-lifecycle.ts';
import { turnInput, characterIdentity } from './context.ts';
import { chooseChatModel } from './chat-model.ts';
import { safeErrorMessage } from '@wisp/protocol/model-errors';
import type { CapabilitySettings } from './capabilities.ts';
import type { ChatGPTAuth } from './chatgpt-auth.ts';

interface TurnDependencies {
  client: Pick<Client, 'sessions'>;
  auth: Pick<ChatGPTAuth, 'accessToken' | 'models' | 'pending'>;
  capabilitySettings: Pick<CapabilitySettings, 'publish' | 'enabled' | 'snapshot'>;
  currentTransport: () => string;
  activeChat: () => string;
  defaultModel: () => string;
  isReady: () => boolean;
  isStopping: () => boolean;
  accountBusy: () => boolean;
  isCurrent: (chat: Chat) => boolean;
  changed: () => void;
  log: (message: string) => void;
}
export function createTurnRunner(deps: TurnDependencies) {
  const {
    client,
    auth,
    capabilitySettings,
    currentTransport,
    activeChat,
    defaultModel,
    isReady,
    isStopping,
    accountBusy,
    isCurrent,
    changed,
    log,
  } = deps;
  const generations = new WeakMap<Chat, symbol>();
  const running = new Set<Promise<void>>();
  const controllers = new WeakMap<Chat, AbortController>();
  async function execute(chat: Chat, text: string, messageId?: string, context?: unknown) {
    if (isStopping() || chat.status === 'working') {
      return;
    }
    const controller = new AbortController();
    controllers.set(chat, controller);
    const generation = Symbol();
    generations.set(chat, generation);
    const ownsTurn = () => generations.get(chat) === generation;
    const owner = currentTransport();
    beginTurn(chat, owner, characterIdentity(context), text, messageId);
    const assertCurrent = () => {
      controller.signal.throwIfAborted();
      if (!ownsTurn() || !isCurrent(chat) || currentTransport() !== owner) {
        throw Error('The conversation was deleted or the character changed.');
      }
    };
    changed();
    const parts = new ReplyProjection();
    const streaming = setInterval(() => {
      if (
        ownsTurn() &&
        isCurrent(chat) &&
        currentTransport() === owner &&
        parts.flush(chat) &&
        !chat.proactive
      ) {
        changed();
      }
    }, 400);
    try {
      await capabilitySettings.publish();
      if (!isReady()) {
        throw new Error('Eve is still starting. Please try again in a few seconds.');
      }
      if (accountBusy() || auth.pending) {
        throw Error('Finish the ChatGPT account operation first.');
      }
      await auth.accessToken();
      const available = await auth.models();
      assertCurrent();
      chat.modelSettings = chooseChatModel(
        available,
        chat.modelSettings?.model || defaultModel(),
        chat.modelSettings?.effort,
      );
      assertCurrent();
      const response = await sendChatTurn(
        client,
        chat,
        turnInput(
          text,
          context,
          {
            ...chat,
            titleGenerated:
              chat.proactive ||
              chat.inline ||
              chat.titleGenerated ||
              !capabilitySettings.enabled('tool:set_conversation_title'),
          },
          capabilitySettings.snapshot(),
        ),
        controller.signal,
      );
      assertCurrent();
      changed();
      for await (const event of response.stream({ signal: controller.signal })) {
        assertCurrent();
        if (applyEvent(chat, event, parts) && !chat.proactive) {
          chat.lastActivityAt = Date.now();
          changed();
        }
      }
      const result = await response.result({ signal: controller.signal });
      assertCurrent();
      if (result.sessionEnded) {
        chat.eveId = undefined;
      }
      if (chat.proactive) {
        chat.tipSkipped = [...parts.streams.values()].some((s) => s.reply.noTip);
      }
      if (result.status === 'failed') {
        throw new Error(
          safeErrorMessage(result.error.message || 'The response failed. Please try again.'),
        );
      }
      settleTurn(
        chat,
        result.status === 'awaiting-input'
          ? 'needs_input'
          : result.status === 'cancelled'
            ? 'cancelled'
            : 'done',
      );
      chat.unread = chat.id !== activeChat();
      if (!parts.streams.size && chat.status === 'done' && !chat.proactive) {
        chat.messages.push({ role: 'system', text: 'The turn completed without a text response.' });
      }
    } catch (error) {
      if (!ownsTurn()) {
        return;
      }
      settleTurn(
        chat,
        !controller.signal.aborted && isCurrent(chat) && currentTransport() === owner
          ? 'error'
          : 'interrupted',
      );
      chat.messages.push({
        role: 'system',
        text: error instanceof Error ? error.message : String(error),
      });
      log(
        'Turn failed: ' +
          chat.id +
          ': ' +
          safeErrorMessage(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      clearInterval(streaming);
      if (ownsTurn()) {
        chat.lastActivityAt = Date.now();
        if (chat.usage) {
          chat.usage.compacting = false;
        }
        for (const state of parts.streams.values()) {
          state.reply.finish();
        }
        if (isCurrent(chat) && currentTransport() === owner) {
          parts.flush(chat, Date.now(), true);
        }
        if (chat.proactive && chat.status === 'done') {
          chat.tipSkipped ||= !chat.messages.some(
            (m) => m.role === 'assistant' && (m.text.trim() || m.ui?.length),
          );
        }
        changed();
      }
    }
  }
  function run(chat: Chat, text: string, messageId?: string, context?: unknown) {
    const work = execute(chat, text, messageId, context);
    running.add(work);
    void work.then(
      () => running.delete(work),
      () => running.delete(work),
    );
    return work;
  }
  return Object.assign(run, {
    drain: () => Promise.allSettled(running),
    interrupt: (chat: Chat) => controllers.get(chat)?.abort(),
  });
}
