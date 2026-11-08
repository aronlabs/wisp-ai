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
