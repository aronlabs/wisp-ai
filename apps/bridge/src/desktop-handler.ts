import { desktopInputs } from '@wisp/protocol/desktop-inputs';
import type { Status } from '@wisp/protocol/desktop';
import { mcpSetup, type McpManager } from './mcp-manager.ts';
import type { ChatGPTAuth } from './chatgpt-auth.ts';
import type { CapabilitySettings } from './capabilities.ts';
import type { PanelStore } from './panels.ts';
import type { RoutineStore } from './routines.ts';
import type { Chat } from './events.ts';
import { openChat, isWorking } from './chat-lifecycle.ts';
export interface PanelCommand {
  seq: number;
  id: string;
  characterKey: string;
  action: 'show' | 'hide';
}
interface DesktopDependencies {
  auth: ChatGPTAuth;
  capabilitySettings: CapabilitySettings;
  mcpManager: McpManager;
  panelStore: PanelStore;
  routineStore: RoutineStore;
  accountOperation: <T>(operation: () => Promise<T>) => Promise<T>;
  updateModel: (model: string) => Promise<void>;
  getStatus: () => Status;
  getChats: () => Chat[];
  currentCharacterKey: () => string | undefined;
  sendPanelCommand: (command: PanelCommand) => void;
  openRoutine: (id: string) => void;
  readSimulationCharacter: () => Promise<unknown>;
  setCapability: (id: string, enabled: boolean) => Promise<void>;
  refreshMcpCatalog: () => void;
  requestStop: () => void;
  changed: () => void;
}
export function createDesktopHandler(deps: DesktopDependencies) {
  const {
    auth,
    capabilitySettings,
    mcpManager,
    panelStore,
    routineStore,
    accountOperation,
    updateModel,
    getStatus,
    getChats,
    currentCharacterKey,
    sendPanelCommand,
    openRoutine,
    readSimulationCharacter,
    setCapability,
    refreshMcpCatalog,
    requestStop,
    changed,
  } = deps;
  const chatFor = (id: string) => getChats().find((chat) => chat.id === id);
  return async (method: string, url: string, raw: unknown) => {
    if (method === 'POST' && url === '/simulator/character') {
      return readSimulationCharacter();
    }
    if (method === 'POST' && url === '/auth/start') {
      const data = desktopInputs['/auth/start'].parse(raw);
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
      const data = desktopInputs['/auth/select'].parse(raw);
      return accountOperation(() => auth.select(data.profileId));
    }
    if (method === 'GET' && url === '/auth/models') {
      return accountOperation(async () => ({ models: await auth.models() }));
    }
    if (method === 'POST' && url === '/auth/model') {
      const data = desktopInputs['/auth/model'].parse(raw);
      return accountOperation(async () => {
        if (auth.pending) {
          throw Error('Finish sign-in first.');
        }
        const model = data.model;
        if (!(await auth.models()).some((m) => m.slug === model)) {
          throw Error('Choose an available model.');
        }
        await updateModel(model);
        return { ok: true, model };
      });
    }
    if (method === 'GET' && url === '/status') {
      return getStatus();
    }
    if (method === 'POST' && url === '/integrations/set') {
      const data = desktopInputs['/integrations/set'].parse(raw);
      await setCapability(data.id, data.enabled);
      changed();
      return { ok: true };
    }
    if (method === 'POST' && url === '/mcps/test') {
      return await mcpManager.test(mcpSetup.parse(raw));
    }
    if (method === 'POST' && url === '/mcps/save') {
      const input = mcpSetup.parse(raw);
      const result = await mcpManager.save(input);
      refreshMcpCatalog();
      await capabilitySettings.set('mcp:' + input.server.name, input.server.enabled);
      changed();
      return result;
    }
    if (method === 'POST' && url === '/mcps/remove') {
      const data = desktopInputs['/mcps/remove'].parse(raw);
      await mcpManager.remove(data.name);
      refreshMcpCatalog();
      await capabilitySettings.publish();
      changed();
      return { ok: true };
    }
    if (method === 'POST' && url === '/panels/action') {
      const data = desktopInputs['/panels/action'].parse(raw);
      const key = data.characterKey,
        id = data.id;
      if (!panelStore.list(key).some((p) => p.id === id)) {
        throw Error('Panel not found');
      }
      if (data.action === 'remove') {
        await panelStore.mutate(key, { operation: 'remove', id });
      } else {
        if (key !== currentCharacterKey()) {
          throw Error('Log into this character first');
        }
        sendPanelCommand({ seq: Date.now(), id, characterKey: key, action: data.action });
      }
      changed();
      return { ok: true };
    }
    if (method === 'POST' && url === '/routines/action') {
      const data = desktopInputs['/routines/action'].parse(raw);
      await routineStore.mutate(data.characterKey, { operation: data.operation, id: data.id });
      changed();
      return { ok: true };
    }
    if (method === 'POST' && url === '/routines/open') {
      const data = desktopInputs['/routines/open'].parse(raw);
      const run = routineStore.runs.find(
        (r) => r.id === data.id && r.characterKey === currentCharacterKey(),
      );
      if (!run || !chatFor(run.id)) {
        throw Error('Log into the character first; the conversation must still exist');
      }
      const chat = chatFor(run.id)!;
      if (isWorking(chat)) {
        throw Error('Wait for the routine to finish');
      }
      openChat(chat);
      openRoutine(run.id);
      changed();
      return { ok: true };
    }
    if (method === 'POST' && url === '/stop') {
      if (getChats().some(isWorking)) {
        throw Error('Wait for the active turn before stopping Wisp');
      }
      requestStop();
      return { ok: true };
    }
    throw Error('Unknown desktop request');
  };
}
