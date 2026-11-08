import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import App from './App.svelte';
import { desktop, request, type Status } from './api';
vi.mock('./api', () => ({ native: true, desktop: vi.fn(), request: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
let status: Status;
beforeEach(() => {
  vi.clearAllMocks();
  status = {
    ready: true,
    gameConnected: true,
    activeTurns: 0,
    model: 'luna',
    auth: {
      status: 'connected',
      revision: 1,
      activeId: 'first',
      account: 'Player',
      profiles: [{ id: 'first', label: 'First account', connected: true }],
    },
    mcps: [],
    integrations: [],
    panels: [],
    suggestions: { levelUp: false, weapon: false },
  };
  vi.mocked(desktop).mockImplementation(async (command) => {
    if (command === 'desktop_info') {
      return {
        configured: true,
        wow: 'E:\\WoW',
        version: '0.2.2',
        platform: 'windows',
        dataDirectory: 'userdata',
      } as never;
    }
    return undefined as never;
  });
  vi.mocked(request).mockImplementation(async (route) => {
    if (route === '/status') {
      return status as never;
    }
    if (route === '/auth/models') {
      return {
        models: [
          { slug: 'luna', displayName: 'Luna', efforts: ['low', 'medium'] },
          { slug: 'sol', displayName: 'Sol', efforts: ['low', 'high'] },
        ],
      } as never;
    }
    if (route === '/auth/start') {
      return { authorizationUrl: 'https://auth.openai.com/authorize?test=1' } as never;
    }
    return { ok: true, count: 3 } as never;
  });
});
afterEach(cleanup);

test('provider-neutral navigation and per-chat default model controls use the bridge contract', async () => {
  render(App);
  await screen.findByText('Ready to help');
  await fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
  expect(screen.getByText('Your AI, connected.')).toBeTruthy();
  await screen.findByRole('option', { name: 'Sol' });
  await fireEvent.change(screen.getByLabelText('Default model for new chats'), {
    target: { value: 'sol' },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Set default' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/auth/model', { model: 'sol' }));
});

test('an active reply disables operations that would interrupt the bridge', async () => {
  status.activeTurns = 1;
  render(App);
  await screen.findByText('Working…');
  expect((screen.getByRole('button', { name: 'Stop Wisp' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    (screen.getByRole('button', { name: 'Install / update addon' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test('MCP add dialog preserves structured arguments and saves without browser credentials', async () => {
  render(App);
  await screen.findByText('Ready to help');
  await fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Add MCP' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'my_tools' } });
  await fireEvent.input(screen.getByLabelText('Endpoint URL'), {
    target: { value: 'https://example.com/mcp' },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/mcps/save', {
      server: {
        name: 'my_tools',
        description: '',
        transport: 'http',
        enabled: true,
        args: [],
        url: 'https://example.com/mcp',
      },
    }),
  );
});

test('sign-in URL is handed to the native allowlisted opener', async () => {
  status.auth.status = 'signed_out';
  status.auth.activeId = undefined;
  status.auth.profiles = [];
  render(App);
  await screen.findByText('Ready to help');
  await fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Continue with ChatGPT' }));
  await waitFor(() =>
    expect(desktop).toHaveBeenCalledWith('open_sign_in', {
      url: 'https://auth.openai.com/authorize?test=1',
    }),
  );
});

test('integration cards expose availability, master and child switches through the bridge', async () => {
  status.integrations = [
    {
      id: 'integration:questie',
      name: 'Questie',
      group: 'integrations',
      kind: 'addon',
      description: 'Forever locations',
      enabled: true,
      effective: true,
      available: true,
      status: 'partial',
      version: '4',
      reason: 'Some service indexes are unavailable.',
    },
    {
      id: 'tool:find_npc_locations',
      parent: 'integration:questie',
      name: 'Find NPC locations',
      toolName: 'questie__find_npc_locations',
      group: 'integrations',
      description: 'Read spawn coordinates',
      enabled: true,
      effective: true,
      available: true,
      status: 'partial',
    },
  ];
  render(App);
  await screen.findByText('Ready to help');
  await fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  expect(screen.getByText('partial')).toBeTruthy();
  expect(screen.getByText('Some service indexes are unavailable.')).toBeTruthy();
  await fireEvent.click(screen.getByLabelText('Questie: Find NPC locations'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/integrations/set', {
      id: 'tool:find_npc_locations',
      enabled: false,
    }),
  );
  await waitFor(() =>
    expect((screen.getByLabelText('Enable Questie') as HTMLInputElement).disabled).toBe(false),
  );
  await fireEvent.click(screen.getByLabelText('Enable Questie'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/integrations/set', {
      id: 'integration:questie',
      enabled: false,
    }),
  );
});

test('built-in capabilities stay out of integrations and memory has separate controls', async () => {
  const { defaultCapabilities } = await import('@wisp/protocol/capabilities');
  status.integrations = defaultCapabilities().map((entry) => ({
    ...entry,
    enabled: true,
    effective: true,
    available: true,
    status: 'ready',
  }));
  render(App);
  await screen.findByText('Ready to help');
  await fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
  expect(screen.queryByRole('checkbox', { name: 'Enable World of Warcraft' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Enable Wisp' })).toBeNull();
  expect(screen.queryByText('Conversation titles')).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Enable Questie' })).toBeTruthy();
  expect(screen.queryByText('Player preferences')).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Memory' }));
  await fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Player preferences' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/integrations/set', {
      id: 'memory:preferences',
      enabled: false,
    }),
  );
});
