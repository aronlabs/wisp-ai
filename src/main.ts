import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { startEveProcess, stopEveProcess } from './agent-process.ts';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'eve/client';
import { COMPACTION_THRESHOLD } from './context-usage.ts';
import { DiskTransport } from './transport.ts';
import { applyEvent, type Chat } from './events.ts';
import { ReplyProjection } from './reply-stream.ts';
import { isAutomaticEmptyChat, resumeChat } from './sessions.ts';
import type { Packet } from './protocol.ts';
import { turnInput, conversationTitle, characterIdentity } from './context.ts';
import { MemoryStore } from './memory-store.ts';
import { inspectionSchema } from './game-inspection.ts';
import { actionSchema, actionTools } from './game-actions.ts';
import { CapabilitySettings, defaultCapabilities } from './capabilities.ts';
import { SnapshotGate } from './snapshots.ts';
import { selectionValues } from './ui-schema.ts';
import { PanelStore, panelInput } from './panels.ts';
import { McpManager, mcpSetup } from './mcp-manager.ts';
import { McpRelay } from './mcp-relay.ts';
import { WindowsVault } from './secret-vault.ts';
import { startDesktopServer } from './desktop-server.ts';
import { AdviceGate, adviceEvent } from './advice.ts';
import { ChatGPTAuth } from './chatgpt-auth.ts';
import { proxyModel } from './model-proxy.ts';
import { safeErrorMessage } from './model-errors.ts';
import { sendChatTurn } from './agent-session.ts';
import { TheWoWDB, databaseRequest } from './thewowdb.ts';
import { searchWowhead, wowheadQuery } from './wowhead-search.ts';
import { Simulator, simulationInput } from './simulation.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(ROOT, 'runtime');
const simulator = new Simulator(ROOT);
await mkdir(runtime, { recursive: true });
const memoryStore = new MemoryStore(path.join(runtime, 'memory'));
let memoryView:
  | { entries?: unknown[]; status: string; error?: string; requestId?: string }
  | undefined;
let memoryViewRequest: string | undefined;
async function memorySnapshot(identity: string | undefined) {
  const preferences = (await memoryStore.read('preferences', 'local-player')).map((entry) => ({
    ...entry,
    slot: 'preferences',
  }));
  const character = identity
    ? (await memoryStore.read('character', identity)).map((entry) => ({
        ...entry,
        slot: 'character',
      }))
    : [];
  return { status: 'available', entries: [...preferences, ...character] };
}
let config: { wow: string; model?: string; mcpConfig?: string };
try {
  config = JSON.parse(await readFile(path.join(ROOT, 'config.local.json'), 'utf8'));
} catch {
  throw new Error('Missing config.local.json. Run scripts/install.ts with the WoW client folder.');
}
const mcpFile = config.mcpConfig
  ? path.resolve(ROOT, config.mcpConfig)
  : path.join(runtime, 'mcp.json');
try {
  await readFile(mcpFile, 'utf8');
} catch {
  await writeFile(mcpFile, JSON.stringify({ servers: {} }));
}
const mcpManager = new McpManager(mcpFile, ROOT, new WindowsVault(path.join(ROOT, 'Wisp.exe')));
await mcpManager.load();
const auth = new ChatGPTAuth(runtime, new WindowsVault(path.join(ROOT, 'Wisp.exe')));
await auth.load();
const database = new TheWoWDB();
const panelStore = new PanelStore(path.join(runtime, 'panels.json'));
await panelStore.load();
const adviceGate = new AdviceGate(path.join(runtime, 'advice-history.json'));
await adviceGate.load();
let currentCharacterKey: string | undefined;
let panelCommand: { seq: number; id: string; characterKey: string; action: string } | undefined;
let suggestions = { levelUp: false, weapon: false };
try {
  suggestions = {
    ...suggestions,
    ...JSON.parse(await readFile(path.join(runtime, 'suggestions.json'), 'utf8')),
  };
} catch {}
const capabilitySettings = new CapabilitySettings(path.join(runtime, 'capabilities.json'));
await capabilitySettings.load();
function refreshMcpCatalog() {
  const catalog = defaultCapabilities();
  for (const server of mcpManager.list()) {
    const url = server.url ? new URL(server.url) : undefined;
    if (url) {
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
    }
    catalog.push({
      id: 'mcp:' + server.name,
      name: server.name,
      group: 'mcps',
      defaultEnabled: server.enabled,
      description:
        (server.description || server.name) + ' - ' + (url?.toString() || 'Local stdio server'),
    });
    for (const tool of server.tools || []) {
      catalog.push({
        id: 'mcp_tool:' + server.name + ':' + tool.name,
        name: tool.name,
        group: 'mcps',
        parent: 'mcp:' + server.name,
        description: (tool.description || tool.name).slice(0, 500),
      });
    }
  }
  capabilitySettings.catalog = catalog;
}
refreshMcpCatalog();
const mcpRelay = new McpRelay(
  mcpManager,
  (name, tool) =>
    capabilitySettings.enabled('mcp:' + name) &&
    (!tool || capabilitySettings.enabled('mcp_tool:' + name + ':' + tool)),
);
const capabilityAcks: Record<string, string> = {};
let capabilityError: { requestId?: string; message: string } | undefined;
const stateFile = path.join(runtime, 'chats.json');
let stateWrites: Promise<unknown> = Promise.resolve();
function persistChats() {
  const content = JSON.stringify(chats, null, 2);
  const operation = stateWrites
    .catch(() => {})
    .then(async () => {
      const temporary = stateFile + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, content);
      await rename(temporary, stateFile);
    });
  stateWrites = operation;
  return operation;
}
let chats: Chat[] = [];
try {
  chats = JSON.parse(await readFile(stateFile, 'utf8'));
  for (const c of chats) {
    c.lastActivityAt ??= c.lastUsedAt ?? 0;
    if (c.usage) {
      c.usage.compacting = false;
    }
    if (c.status === 'working') {
      c.status = 'interrupted';
    }
  }
} catch {}
if (chats.some(isAutomaticEmptyChat)) {
  await writeFile(
    path.join(runtime, 'chats.before-session-resume.json'),
    JSON.stringify(chats, null, 2),
  );
  chats = chats.filter((c) => !isAutomaticEmptyChat(c));
}
let activeTransport = '';
let firstReadyRevision = 0;
let activeChat = '';
let inlineChat = '';
const snapshots = new SnapshotGate();
let acknowledgments: number[] = [];
let eveReady = false;
let contextWindowTokens: number | undefined;
let dirty = true;
const handled = new Set<string>();
const deletedChatIds = new Set<string>();
const pending = new Map<
  string,
  {
    chat: string;
    session: string;
    sections?: string[];
    inspection?: unknown;
    action?: unknown;
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const client = new Client({ baseUrl: 'http://127.0.0.1:43186' });
async function readSimulationCharacter(chat = 'desktop-simulation'): Promise<unknown> {
  if (!activeTransport || !capabilitySettings.enabled('tool:query_character')) {
    throw Error('Connect WoW and enable Character readings first.');
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      changed();
      reject(Error('WoW did not respond. Reload the addon and try again.'));
    }, 30000);
    pending.set(id, {
      chat,
      session: activeTransport,
      sections: ['character', 'talents', 'spells', 'gear'],
      resolve,
      reject,
      timer,
    });
    changed();
  });
}
mcpRelay.readOnlyMode = () => chats.some((c) => c.proactive && c.status === 'working');
const token = randomBytes(32).toString('hex');
function log(message: string) {
  console.log(new Date().toISOString(), message);
}
function changed() {
  dirty = true;
}
function chatFor(id: string | undefined) {
  return chats.find((c) => c.id === id);
}
function createChat(id: string) {
  const chat: Chat = {
    lastActivityAt: Date.now(),
    id,
    title: 'New conversation',
    owner: activeTransport,
    messages: [],
    activity: [],
    status: 'idle',
  };
  chats.push(chat);
  return chat;
}
async function run(chat: Chat, text: string, messageId?: string, context?: unknown) {
  if (chat.status === 'working') {
    return;
  }
  chat.status = 'working';
  chat.activity = [];
  chat.owner = activeTransport;
  chat.historyVersion = 3;
  chat.lastUsedAt = Date.now();
  chat.lastActivityAt = Date.now();
  chat.characterKey = characterIdentity(context);
  chat.messages.push({ id: messageId || randomUUID(), role: 'user', text });
  changed();
  const parts = new ReplyProjection();
  const streaming = setInterval(() => {
    if (parts.flush(chat) && !chat.proactive) {
      changed();
    }
  }, 400);
  try {
    if (!eveReady) {
      throw new Error('Eve is still starting. Please try again in a few seconds.');
    }
    if (accountBusy || auth.pending) {
      throw Error('Finish the ChatGPT account operation first.');
    }
    await auth.accessToken();
    const response = await sendChatTurn(
      client,
      chat,
      turnInput(text, context, {
        ...chat,
        titleGenerated:
          chat.proactive ||
          chat.inline ||
          chat.titleGenerated ||
          !capabilitySettings.enabled('tool:set_conversation_title'),
      }),
    );
    changed();
    for await (const event of response.stream()) {
      if (
        applyEvent(
          chat,
          event as unknown as { type: string; data: Record<string, unknown> },
          parts,
        ) &&
        !chat.proactive
      ) {
        chat.lastActivityAt = Date.now();
        changed();
      }
    }
    const result = await response.result();
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
    chat.status =
      result.status === 'awaiting-input'
        ? 'needs_input'
        : result.status === 'cancelled'
          ? 'cancelled'
          : 'done';
    chat.unread = chat.id !== activeChat;
    if (!parts.streams.size && chat.status === 'done' && !chat.proactive) {
      chat.messages.push({ role: 'system', text: 'The turn completed without a text response.' });
    }
  } catch (error) {
    chat.status = 'error';
    chat.messages.push({
      role: 'system',
      text: error instanceof Error ? error.message : String(error),
    });
    log('Turn failed: ' + chat.id);
  } finally {
    clearInterval(streaming);
    chat.lastActivityAt = Date.now();
    if (chat.usage) {
      chat.usage.compacting = false;
    }
    for (const state of parts.streams.values()) {
      state.reply.finish();
    }
    parts.flush(chat, Date.now(), true);
    changed();
  }
}
function receive(packet: Packet) {
  const establishesSession =
    packet.type === 'hello' || (!activeTransport && packet.type === 'poll');
  if (!establishesSession && packet.session !== activeTransport) {
    return;
  }
  const newTransport = establishesSession && activeTransport !== packet.session;
  if (newTransport) {
    for (const req of pending.values()) {
      clearTimeout(req.timer);
      req.reject(new Error('The addon reloaded or the character changed. Query again.'));
    }
    pending.clear();
    activeTransport = packet.session;
    firstReadyRevision = 0;
    activeChat = resumeChat(chats, packet.chat)?.id || '';
    memoryView = undefined;
    acknowledgments = [];
    handled.clear();
    transport.resetSession();
  }
  if (packet.type !== 'poll' && !packet.heartbeat && !acknowledgments.includes(packet.seq)) {
    acknowledgments.push(packet.seq);
    acknowledgments = acknowledgments.slice(-32);
  }
  if (Number.isSafeInteger(packet.nextSlot) && packet.nextSlot! >= 1 && packet.nextSlot! <= 1024) {
    transport.setCursor(packet.nextSlot!, Number(packet.receivedRev || 0));
  }
  if (packet.heartbeat && !newTransport) {
    return;
  }
  const packetKey = packet.session + ':' + packet.seq;
  if (handled.has(packetKey)) {
    if (packet.type !== 'poll') {
      changed();
    }
    return;
  }
  handled.add(packetKey);
  if (packet.context) {
    currentCharacterKey = characterIdentity(packet.context) || currentCharacterKey;
  }
  if (packet.type === 'advice_event') {
    const parsed = adviceEvent.safeParse(packet.data),
      identity = characterIdentity(packet.context);
    if (!parsed.success || !identity) {
      return;
    }
    if (
      !adviceGate.accept(
        identity,
        parsed.data,
        packet.at * 1000,
        Date.now(),
        suggestions,
        chats.some((c) => c.status === 'working'),
      )
    ) {
      return;
    }
    void adviceGate.save().catch(() => {});
    const chat = createChat('advice-' + randomUUID());
    chat.proactive = true;
    chat.titleGenerated = true;
    chat.title =
      parsed.data.kind === 'level_up'
        ? 'Level ' + parsed.data.level + ' suggestion'
        : 'Equipment suggestion';
    void run(
      chat,
      'Automatic game event (data, not a user request): ' + JSON.stringify(parsed.data),
      undefined,
      packet.context,
    );
    changed();
    return;
  }
  if (packet.type === 'dismiss_tip' && packet.chat) {
    const chat = chatFor(packet.chat);
    if (chat?.proactive) {
      chat.dismissed = true;
      changed();
    }
    return;
  }
  if (packet.type === 'panel_ask' && packet.key && packet.nodeId) {
    const identity = characterIdentity(packet.context),
      panel = identity ? panelStore.list(identity).find((p) => p.id === packet.key) : undefined;
    const node = panel?.ui.find((n) => n.id === packet.nodeId);
    if (!panel || node?.kind !== 'button' || node.action.kind !== 'ask') {
      return;
    }
    let values: ReturnType<typeof selectionValues>;
    try {
      values = selectionValues(panel.ui, packet.values);
    } catch {
      return;
    }
    const id = packet.chat || 'panel-' + randomUUID();
    let chat = chatFor(id);
    if (!chat) {
      chat = createChat(id);
      chat.inline = true;
      chat.title = panel.title;
      chat.titleGenerated = true;
    }
    inlineChat = id;
    void run(
      chat,
      node.action.prompt +
        '\n\nPersistent panel: ' +
        panel.id +
        '\nSelected values: ' +
        JSON.stringify(values),
      packet.messageId,
      packet.context,
    );
    changed();
    return;
  }
  if (packet.type === 'ui_action') {
    const chat = chatFor(packet.chat),
      message = chat?.messages.find((m) => m.id === packet.messageId);
    const node = message?.ui?.find((n) => n.id === packet.nodeId);
    if (
      !chat ||
      chat.owner !== activeTransport ||
      chat.status === 'working' ||
      node?.kind !== 'button'
    ) {
      return;
    }
    void (async () => {
      if (node.action.kind === 'ask') {
        const values = selectionValues(message!.ui || [], packet.values);
        await run(
          chat,
          node.action.prompt + '\n\nSelected panel values: ' + JSON.stringify(values),
          undefined,
          packet.context,
        );
      } else {
        const undo = node.action.kind === 'undo_settings',
          tool = undo ? 'undo_settings' : 'update_settings';
        if (!capabilitySettings.enabled('tool:' + tool)) {
          throw new Error('This tool is disabled in Settings');
        }
        const identity = characterIdentity(packet.context);
        if (!identity || identity !== chat.characterKey) {
          throw new Error('Character identity changed; ask again for this character');
        }
        const current = JSON.parse(identity) as string[],
          id = randomUUID();
        const action = {
          kind: tool,
          args: undo
            ? { transactionId: node.action.transactionId }
            : { operation: 'apply', transactionId: node.action.transactionId },
          expectedCharacter: { realm: current[1], name: current[2] },
        };
        chat.status = 'working';
        changed();
        try {
          const result = await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error('WoW did not respond to the settings request'));
            }, 30000);
            pending.set(id, {
              chat: chat.id,
              session: activeTransport,
              action,
              resolve,
              reject,
              timer,
            });
            changed();
          });
          chat.lastUIResult = result;
          const value = result as {
            status?: string;
            data?: { verified?: boolean; status?: string };
            error?: string;
          };
          chat.messages.push({
            id: 'settings-' + id,
            role: 'system',
            text:
              value.status === 'completed' && value.data?.verified
                ? undo
                  ? 'Settings restored.'
                  : 'Settings applied. You can undo these changes.'
                : 'Settings were not applied: ' + (value.error || 'Verification failed.'),
          });
          if (!undo && value.status === 'completed' && value.data?.verified) {
            const undoId = node.id.slice(0, 55) + '_undo';
            if (!message!.ui!.some((n) => n.id === undoId)) {
              message!.ui!.push({
                id: undoId,
                parent: node.parent,
                kind: 'button',
                label: 'Undo changes',
                action: { kind: 'undo_settings', transactionId: node.action.transactionId },
              });
            }
          }
        } finally {
          chat.status = 'done';
          changed();
        }
      }
    })().catch((error) => {
      chat.messages.push({ role: 'system', text: error.message });
      changed();
    });
    return;
  }
  if (
    packet.type === 'inline_say' &&
    packet.chat &&
    typeof packet.text === 'string' &&
    packet.text.length <= 16000 &&
    !deletedChatIds.has(packet.chat)
  ) {
    let chat = chatFor(packet.chat);
    if (!chat) {
      chat = createChat(packet.chat);
      chat.inline = true;
      chat.title = 'Quick question';
      chat.titleGenerated = true;
    }
    if (!chat.inline) {
      return;
    }
    inlineChat = chat.id;
    void run(chat, packet.text, packet.messageId, packet.context);
    changed();
    return;
  }
  if (packet.type === 'promote_inline' && packet.chat) {
    const chat = chatFor(packet.chat);
    if (chat?.inline) {
      chat.inline = false;
      chat.titleGenerated = false;
      activeChat = chat.id;
      inlineChat = '';
      changed();
    }
    return;
  }
  if (packet.type === 'capability_set') {
    const transportSession = activeTransport;
    void (async () => {
      if (typeof packet.key !== 'string' || typeof packet.enabled !== 'boolean') {
        throw new Error('Invalid capability setting');
      }
      await capabilitySettings.set(packet.key, packet.enabled);
      if (activeTransport === transportSession) {
        capabilityAcks[packet.key] = packet.requestId || '';
        capabilityError = undefined;
      }
    })()
      .catch((error) => {
        if (activeTransport === transportSession) {
          capabilityError = { requestId: packet.requestId, message: error.message };
        }
      })
      .finally(changed);
    changed();
    return;
  }
  if (['memory_list', 'memory_save', 'memory_remove'].includes(packet.type)) {
    const identity = characterIdentity(packet.context),
      transportSession = activeTransport;
    memoryViewRequest = packet.requestId;
    void (async () => {
      if (packet.type !== 'memory_list') {
        if (packet.slot !== 'preferences' && packet.slot !== 'character') {
          throw new Error('Invalid memory scope');
        }
        const owner = packet.slot === 'preferences' ? 'local-player' : identity;
        if (!owner || typeof packet.key !== 'string') {
          throw new Error('A fresh character identity and memory key are required');
        }
        if (packet.type === 'memory_save' && typeof packet.text !== 'string') {
          throw new Error('Memory text is required');
        }
        await memoryStore.update(
          packet.slot,
          owner,
          packet.key,
          packet.type === 'memory_save' ? packet.text : undefined,
        );
      }
      const snapshot = await memorySnapshot(identity);
      if (activeTransport === transportSession && memoryViewRequest === packet.requestId) {
        memoryView = { ...snapshot, requestId: packet.requestId };
      }
    })()
      .catch((error) => {
        if (activeTransport === transportSession && memoryViewRequest === packet.requestId) {
          memoryView = { status: 'unavailable', error: error.message, requestId: packet.requestId };
        }
      })
      .finally(changed);
    changed();
    return;
  }
  if (packet.type === 'delete' && packet.chat) {
    const removed = chatFor(packet.chat);
    deletedChatIds.add(packet.chat);
    chats = chats.filter((c) => c.id !== packet.chat);
    for (const [id, req] of pending) {
      if (req.chat === packet.chat) {
        clearTimeout(req.timer);
        req.reject(new Error('Conversation deleted'));
        pending.delete(id);
      }
    }
    if (removed?.eveId) {
      void client.sessions
        .attach(removed.eveId)
        .end({ reason: 'Conversation deleted by user' })
        .catch(() => {});
    }
    activeChat = resumeChat(chats, packet.nextChat)?.id || '';
    changed();
    return;
  }
  if (packet.chat && deletedChatIds.has(packet.chat) && packet.type !== 'hello') {
    changed();
    return;
  }
  if (packet.type === 'hello') {
    activeChat = resumeChat(chats, packet.chat)?.id || '';
  } else if (packet.chat && ['new', 'say', 'select'].includes(packet.type)) {
    activeChat = packet.chat;
  }
  if (['new', 'say'].includes(packet.type) && packet.chat && !chatFor(packet.chat)) {
    createChat(packet.chat);
  }
  if (
    packet.type === 'say' &&
    packet.chat &&
    typeof packet.text === 'string' &&
    packet.text.length <= 16000
  ) {
    void run(chatFor(packet.chat)!, packet.text, packet.messageId, packet.context);
  }
  if (packet.type === 'select') {
    const chat = chatFor(packet.chat);
    if (chat) {
      if (chat.proactive) {
        chat.proactive = false;
        chat.dismissed = true;
        chat.titleGenerated = false;
      }
      chat.unread = false;
      chat.lastUsedAt = Date.now();
    }
  }
  if (packet.type === 'state_result' && packet.requestId) {
    const req = pending.get(packet.requestId);
    if (req && req.session === packet.session && req.chat === packet.chat) {
      clearTimeout(req.timer);
      pending.delete(packet.requestId);
      req.resolve(packet.data);
    }
  }
  if (packet.type === 'cancel') {
    const chat = chatFor(packet.chat);
    if (chat?.eveId) {
      void client.sessions
        .attach(chat.eveId)
        .cancel()
        .catch(() => {});
    }
  }
  if (packet.type !== 'poll') {
    changed();
  }
}
const transport = new DiskTransport(config.wow, receive);
const server = createServer(async (req, res) => {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (req.method === 'POST' && req.url === '/model/responses') {
    try {
      await proxyModel(req, res, auth);
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
      } else {
        res.writeHead(503, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            error: { message: e instanceof Error ? e.message : 'Model request failed' },
          }),
        );
      }
    }
    return;
  }
  if ((req.url || '').startsWith('/mcp/')) {
    try {
      await mcpRelay.handle(req, res, (req.url || '').slice(5));
    } catch {
      res.writeHead(503).end('MCP connection failed');
    }
    return;
  }
  if (
    req.method !== 'POST' ||
    ![
      '/state',
      '/title',
      '/identity',
      '/memory',
      '/inspect',
      '/action',
      '/panels',
      '/database',
      '/wowhead',
      '/simulate',
    ].includes(req.url || '')
  ) {
    res.writeHead(404).end();
    return;
  }
  try {
    req.setEncoding('utf8');
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 32768) {
        throw new Error('Request is too large');
      }
    }
    const data = JSON.parse(body);
    const chat = chats.find((c) => c.eveId === data.eveSession && c.status === 'working');
    if (!chat || !activeTransport || chat.owner !== activeTransport) {
      throw new Error('No active connection for this character');
    }
    if (
      chat.proactive &&
      (req.url === '/action' ||
        (req.url === '/memory' && data.operation !== 'list') ||
        (req.url === '/panels' && ['save', 'remove'].includes(data.input?.operation)))
    ) {
      throw Error(
        'Automatic suggestions cannot change settings, memory, panels, macros or map markers',
      );
    }
    if (req.url === '/simulate') {
      if (chat.proactive || !capabilitySettings.enabled('tool:simulate_dps')) {
        throw Error('DPS simulation is disabled or not allowed for automatic suggestions.');
      }
      const { eveSession: _session, ...args } = data;
      const input = simulationInput.parse(args);
      const abort = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) {
          abort.abort();
        }
      });
      const snapshot = await readSimulationCharacter(chat.id);
      if (
        chat.owner !== activeTransport ||
        (chat.characterKey && characterIdentity(snapshot) !== chat.characterKey)
      ) {
        throw Error('The character changed. Request a new simulation.');
      }
      const result = await simulator.run(snapshot, input, abort.signal);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      return;
    }
    if (req.url === '/database' || req.url === '/wowhead') {
      const tool =
        req.url === '/wowhead'
          ? 'web_search'
          : data.operation === 'search'
            ? 'search_database'
            : 'get_database_entity';
      if (!capabilitySettings.enabled('tool:' + tool)) {
        throw new Error('This knowledge source is disabled in Settings');
      }
      const abort = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) {
          abort.abort();
        }
      });
      const { eveSession: _session, ...args } = data;
      const result =
        req.url === '/database'
          ? await database.query(databaseRequest.parse(args), abort.signal)
          : await searchWowhead(
              wowheadQuery.parse(args).query,
              auth,
              config.model || 'gpt-6-luna',
              abort.signal,
            );
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      return;
    }
    if (req.url === '/panels') {
      if (!capabilitySettings.enabled('tool:manage_panel')) {
        throw Error('Persistent panels are disabled');
      }
      if (!chat.characterKey) {
        throw Error('A fresh character identity is required');
      }
      const input = panelInput.parse(data.input);
      const panels =
        input.operation === 'save' || input.operation === 'remove'
          ? await panelStore.mutate(chat.characterKey, input)
          : panelStore.list(chat.characterKey);
      changed();
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify(
          input.operation === 'get'
            ? { panel: panels.find((p) => p.id === input.id) || null }
            : input.operation === 'list'
              ? {
                  panels: panels.map((p) => ({
                    id: p.id,
                    title: p.title,
                    bindings: p.bindings,
                    updatedAt: p.updatedAt,
                  })),
                }
              : { panels },
        ),
      );
      return;
    }
    if (req.url === '/identity') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ characterKey: chat.characterKey || null }));
      return;
    }
    if (req.url === '/memory') {
      if (data.slot !== 'preferences' && data.slot !== 'character') {
        throw new Error('Invalid memory scope');
      }
      if (!capabilitySettings.enabled('memory:' + data.slot)) {
        throw new Error('This memory capability is disabled in Settings');
      }
      const owner = data.slot === 'preferences' ? 'local-player' : chat.characterKey;
      if (!owner) {
        throw new Error('No fresh character identity for this memory');
      }
      let entries;
      if (data.operation === 'list') {
        entries = await memoryStore.read(data.slot, owner);
      } else if (data.operation === 'save' || data.operation === 'remove') {
        if (
          typeof data.key !== 'string' ||
          (data.operation === 'save' && typeof data.text !== 'string')
        ) {
          throw new Error('Invalid memory entry');
        }
        entries = await memoryStore.update(
          data.slot,
          owner,
          data.key,
          data.operation === 'save' ? data.text : undefined,
        );
        const snapshot = await memorySnapshot(chat.characterKey);
        if (chat.owner === activeTransport) {
          memoryView = snapshot;
        }
        changed();
      } else {
        throw new Error('Invalid memory operation');
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ entries }));
      return;
    }
    if (req.url === '/title') {
      if (!capabilitySettings.enabled('tool:set_conversation_title')) {
        throw new Error('Conversation titles are disabled in Settings');
      }
      const title = conversationTitle(data.title);
      if (!title) {
        throw new Error('A conversation title is required');
      }
      chat.title = title;
      chat.titleGenerated = true;
      changed();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ title }));
      return;
    }
    const inspection = req.url === '/inspect' ? inspectionSchema.parse(data.inspection) : undefined;
    const action = req.url === '/action' ? actionSchema.parse(data.action) : undefined;
    const tool = action
      ? actionTools[action.kind]
      : inspection
        ? (
            {
              settings: 'get_settings',
              npc_locations: 'find_npc_locations',
              reference: 'inspect_reference',
              progression: 'query_progression',
              target: 'inspect_target',
              trainer: 'inspect_trainer',
              resources: 'query_resources',
              compare_items: 'compare_items',
              auctions: 'inspect_auctions',
              macros: 'inspect_macros',
              map: 'inspect_map',
            } as const
          )[inspection.kind]
        : 'query_character';
    if (!capabilitySettings.enabled('tool:' + tool)) {
      throw new Error('This tool is disabled in Settings');
    }
    if (action && !chat.characterKey) {
      throw new Error('A fresh character identity is required before applying an action');
    }
    if (!inspection && !action) {
      const allowed = new Set([
        'character',
        'location',
        'talents',
        'spells',
        'quests',
        'gear',
        'bags',
      ]);
      if (
        !Array.isArray(data.sections) ||
        !data.sections.length ||
        data.sections.length > 7 ||
        data.sections.some((s: unknown) => !allowed.has(String(s)))
      ) {
        throw new Error('Invalid sections');
      }
    }
    const id = randomUUID();
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        changed();
        reject(new Error('WoW did not respond in time. Open Wisp and try again.'));
      }, 30_000);
      const identity = action ? (JSON.parse(chat.characterKey!) as string[]) : undefined;
      pending.set(id, {
        chat: chat.id,
        session: activeTransport,
        ...(action
          ? {
              action: { ...action, expectedCharacter: { realm: identity![1], name: identity![2] } },
            }
          : inspection
            ? { inspection }
            : { sections: [...new Set(data.sections as string[])] }),
        resolve,
        reject,
        timer,
      });
      changed();
    });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(503).end(error instanceof Error ? error.message : String(error));
  }
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(43187, '127.0.0.1', resolve);
});
await writeFile(path.join(runtime, 'bridge.pid'), String(process.pid));
await transport.start();
const eveLog = await import('node:fs').then((fs) =>
  fs.openSync(path.join(runtime, 'eve.log'), 'a'),
);
function startEve() {
  return startEveProcess({
    root: ROOT,
    logFile: eveLog,
    environment: {
      ...process.env,
      WOW_BRIDGE_TOKEN: token,
      WOW_CAPABILITIES_FILE: capabilitySettings.file,
      WOW_MCP_CONFIG: mcpFile,
      ...(config.model ? { WOW_MODEL: config.model } : {}),
      DO_NOT_TRACK: '1',
    },
    onError: (error) => log('Could not start Eve: ' + error.message),
    onExit: (code) => {
      eveReady = false;
      changed();
      log('Eve exited: ' + code);
    },
  });
}
let eve = startEve();
async function killEve() {
  await stopEveProcess(eve);
  eveReady = false;
}
let accountBusy = false;
async function accountOperation<T>(operation: () => Promise<T>) {
  if (accountBusy || chats.some((c) => c.status === 'working')) {
    throw Error('Wait for the active operation to finish.');
  }
  accountBusy = true;
  try {
    return await operation();
  } finally {
    accountBusy = false;
  }
}
const health = setInterval(
  () =>
    void client
      .health()
      .then(async () => {
        if (!eveReady) {
          contextWindowTokens = undefined;
          try {
            const info = await client.info();
            const window = info.agent.model?.contextWindowTokens;
            if (typeof window === 'number' && Number.isSafeInteger(window) && window > 0) {
              contextWindowTokens = window;
            }
          } catch {
            // Unknown capacity is displayed as unknown, never a made-up limit.
          }
          eveReady = true;
          changed();
          log('Eve ready.');
        }
      })
      .catch(() => {
        if (eveReady) {
          eveReady = false;
          changed();
        }
      }),
  3000,
);
const desktopServer = await startDesktopServer(runtime, async (method, url, raw) => {
  const data = raw as Record<string, any>;
  if (method === 'POST' && url === '/simulator/character') {
    return readSimulationCharacter();
  }
  if (method === 'POST' && url === '/auth/start') {
    return accountOperation(() =>
      auth.beginSignIn(
        typeof data.profileId === 'string' ? data.profileId : undefined,
        data.newAccount === true,
      ),
    );
  }
  if (method === 'POST' && url === '/auth/cancel') {
    await auth.cancel();
    return auth.state();
  }
  if (method === 'POST' && url === '/auth/disconnect') {
    return accountOperation(() => auth.disconnect());
  }
  if (method === 'POST' && url === '/auth/select') {
    return accountOperation(() => auth.select(String(data.profileId)));
  }
  if (method === 'GET' && url === '/auth/models') {
    return accountOperation(async () => ({ models: await auth.models() }));
  }
  if (method === 'POST' && url === '/auth/model') {
    return accountOperation(async () => {
      if (auth.pending) {
        throw Error('Finish sign-in first.');
      }
      const model = String(data.model);
      if (!(await auth.models()).some((m) => m.slug === model)) {
        throw Error('Choose an available model.');
      }
      const updated = { ...config, model };
      const file = path.join(ROOT, 'config.local.json');
      await writeFile(file + '.tmp', JSON.stringify(updated, null, 2));
      await rename(file + '.tmp', file);
      config = updated;
      await killEve();
      eve = startEve();
      changed();
      return { ok: true, model };
    });
  }
  if (method === 'GET' && url === '/status') {
    return {
      ready: eveReady,
      gameConnected: Boolean(
        activeTransport && firstReadyRevision && transport.peerRevision >= firstReadyRevision,
      ),
      auth: auth.state(),
      model: config.model || 'gpt-6-luna',
      activeTurns: chats.filter((c) => c.status === 'working').length,
      mcps: mcpManager
        .list()
        .map((s) => ({ ...s, enabled: s.enabled && capabilitySettings.enabled('mcp:' + s.name) })),
      panels: panelStore.panels.map((p) => ({
        ...p,
        character: (() => {
          try {
            const identity = JSON.parse(p.characterKey);
            return identity[2] + ' - ' + identity[1];
          } catch {
            return p.characterKey;
          }
        })(),
      })),
      suggestions,
    };
  }
  if (method === 'POST' && url === '/mcps/test') {
    return await mcpManager.test(mcpSetup.parse(data));
  }
  if (method === 'POST' && url === '/mcps/save') {
    const input = mcpSetup.parse(data);
    const result = await mcpManager.save(input);
    refreshMcpCatalog();
    await capabilitySettings.set('mcp:' + input.server.name, input.server.enabled);
    changed();
    return result;
  }
  if (method === 'POST' && url === '/mcps/remove') {
    await mcpManager.remove(String(data.name));
    refreshMcpCatalog();
    changed();
    return { ok: true };
  }
  if (method === 'POST' && url === '/panels/action') {
    const key = String(data.characterKey),
      id = String(data.id);
    if (!panelStore.list(key).some((p) => p.id === id)) {
      throw Error('Panel not found');
    }
    if (data.action === 'remove') {
      await panelStore.mutate(key, { operation: 'remove', id });
    } else if (['show', 'hide'].includes(data.action)) {
      if (key !== currentCharacterKey) {
        throw Error('Log into this character first');
      }
      panelCommand = { seq: Date.now(), id, characterKey: key, action: data.action };
    } else {
      throw Error('Unknown panel action');
    }
    changed();
    return { ok: true };
  }
  if (method === 'POST' && url === '/suggestions') {
    if (typeof data.levelUp !== 'boolean' || typeof data.weapon !== 'boolean') {
      throw Error('Invalid suggestion settings');
    }
    suggestions = { levelUp: data.levelUp, weapon: data.weapon };
    await writeFile(path.join(runtime, 'suggestions.json'), JSON.stringify(suggestions));
    changed();
    return { ok: true };
  }
  if (method === 'POST' && url === '/stop') {
    if (chats.some((c) => c.status === 'working')) {
      throw Error('Wait for the active turn before stopping Wisp');
    }
    setTimeout(stop, 200);
    return { ok: true };
  }
  throw Error('Unknown desktop request');
});
const publish = setInterval(() => {
  if (!dirty || !activeTransport) {
    return;
  }
  dirty = false;
  const snapshot = snapshots.next({
    v: 1,
    session: activeTransport,
    connected: eveReady,
    contextPolicy: { windowTokens: contextWindowTokens, compactAt: COMPACTION_THRESHOLD },
    acks: acknowledgments,
    activeChat,
    chats: chats
      .filter(
        (c) =>
          (!c.inline && !c.proactive) ||
          c.id === activeChat ||
          c.id === inlineChat ||
          c.status === 'working' ||
          (c.proactive &&
            !c.dismissed &&
            !c.tipSkipped &&
            Date.now() - (c.lastUsedAt || 0) < 900000),
      )
      .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        unread: c.unread,
        usage: c.usage,
        lastActivityAt: c.lastActivityAt,
        activity: c.activity,
        inline: c.inline,
        proactive: c.proactive,
        messages:
          c.id === activeChat ||
          c.id === inlineChat ||
          (c.inline && c.status === 'working') ||
          (c.proactive && c.status === 'done')
            ? c.messages.map((m, index) => ({
                ...m,
                id: m.id || c.id + '-message-' + index,
                text: m.text.slice(0, 20000),
              }))
            : undefined,
      })),
    notifications: chats
      .filter(
        (c) =>
          c.proactive &&
          c.characterKey === currentCharacterKey &&
          c.status === 'done' &&
          !c.dismissed &&
          !c.tipSkipped &&
          Date.now() - (c.lastUsedAt || 0) < 900000 &&
          c.messages.some((m) => m.role === 'assistant' && (m.text || m.ui?.length)),
      )
      .slice(-3)
      .map((c) => ({ id: c.id, title: c.title })),
    panels: currentCharacterKey ? panelStore.list(currentCharacterKey) : [],
    panelCommand,
    suggestions,
    memory: memoryView,
    capabilities: {
      entries: capabilitySettings.snapshot(),
      acks: capabilityAcks,
      error: capabilityError,
    },
    requests: [...pending.entries()].map(([id, r]) => ({
      id,
      chat: r.chat,
      sections: r.sections,
      inspection: r.inspection,
      action: r.action,
    })),
  });
  if (snapshot && eveReady && !firstReadyRevision) {
    firstReadyRevision = snapshot.rev;
  }
  if (snapshot) {
    void transport.publish(snapshot).catch((error) => {
      snapshots.invalidate();
      dirty = true;
      log('Failed to publish reply: ' + error.message);
    });
  }
  void persistChats().catch(() => log('Could not save conversations'));
}, 400);
log('Wisp started. WoW: ' + config.wow);
let stopping = false;
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  clearInterval(health);
  clearInterval(publish);
  await auth.cancel();
  transport.stop();
  server.close();
  desktopServer.close();
  await Promise.allSettled([mcpRelay.close(), mcpManager.close()]);
  await killEve();
  for (const r of pending.values()) {
    clearTimeout(r.timer);
    r.reject(new Error('Bridge stopped'));
  }
  await persistChats().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
