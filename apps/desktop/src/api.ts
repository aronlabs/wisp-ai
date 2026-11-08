import { invoke, isTauri } from '@tauri-apps/api/core';
export const native = isTauri();
export function desktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native) {
    return Promise.reject(Error('This action is available in the Wisp desktop app.'));
  }
  return invoke<T>(command, args);
}
export function request<T = Record<string, unknown>>(route: string, body?: unknown): Promise<T> {
  return desktop<T>('bridge_request', {
    method: body === undefined ? 'GET' : 'POST',
    route,
    body: body ?? null,
  });
}
export type { DesktopInfo, Model, Mcp, Panel, Status } from '@wisp/protocol/desktop';
