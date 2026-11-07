import { defineDynamic } from 'eve';
import { capabilityEnabled } from './capabilities.ts';
export function enabledTool<T>(name: string, definition: T) {
  return defineDynamic(async () => ((await capabilityEnabled('tool:' + name)) ? definition : null));
}
