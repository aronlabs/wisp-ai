import { toolDescriptions } from '@wisp/protocol/capabilities';
import { defineDynamic } from 'eve';
import { capabilityEnabled } from './capabilities.ts';
export function enabledTool<T>(name: string, definition: T) {
  if (!Object.hasOwn(toolDescriptions, name)) {
    throw new Error('Unregistered tool: ' + name);
  }
  return defineDynamic(async () => ((await capabilityEnabled('tool:' + name)) ? definition : null));
}
