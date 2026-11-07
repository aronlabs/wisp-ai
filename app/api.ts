import { invoke, isTauri } from '@tauri-apps/api/core';
export const native = isTauri();
export function desktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native) return Promise.reject(Error('This action is available in the Wisp desktop app.'));
  return invoke<T>(command, args);
}
export function request<T = Record<string, unknown>>(route: string, body?: unknown): Promise<T> {
  return desktop<T>('bridge_request', {
    method: body === undefined ? 'GET' : 'POST',
    route,
    body: body ?? null,
  });
}
export interface DesktopInfo {
  wow?: string;
  configured: boolean;
  dataDirectory: string;
  platform: string;
  version: string;
}
export interface Model {
  slug: string;
  displayName: string;
  efforts: string[];
}
export interface Mcp {
  name: string;
  description?: string;
  transport: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args: string[];
  enabled: boolean;
  hasToken?: boolean;
  envKeys?: string[];
  tools?: { name: string; description?: string }[];
}
export interface Panel {
  id: string;
  title: string;
  character: string;
  characterKey: string;
  bindings?: unknown[];
  hidden?: boolean;
}
export interface Status {
  ready: boolean;
  gameConnected: boolean;
  model: string;
  activeTurns: number;
  auth: {
    status: string;
    activeId?: string;
    account?: string;
    message?: string;
    revision: number;
    profiles: { id: string; label: string; connected: boolean }[];
  };
  mcps: Mcp[];
  panels: Panel[];
  suggestions: { levelUp: boolean; weapon: boolean };
}
