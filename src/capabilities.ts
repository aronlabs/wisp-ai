import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export interface Capability { id: string; name: string; group: 'tools' | 'mcps' | 'memory'; description: string; parent?: string; defaultEnabled?: boolean; }
export const everlootTools = ['search_knowledge', 'get_entity', 'get_by_name', 'answer_sources', 'item_page', 'npc_page', 'object_page', 'quest_page', 'vendor_page', 'world_map_near', 'entity_relations', 'item_categories', 'talent_tree', 'talent_plan', 'class_races', 'profession_path', 'recipe_thresholds', 'market_value', 'auction_history', 'coverage', 'recent_changes'];
export const toolDescriptions: Record<string, [string, string]> = {
  manage_panel: ['Persistent panels', 'Create, read, edit and remove character-specific native panels with local live data bindings.'],
  get_settings: ['Read settings', 'Discover live game and registered AceConfig options; read addons, action bars and keybindings.'],
  update_settings: ['Change settings', 'Preview or apply verified settings proposals through native APIs and addon setters. No addon source edits.'],
  undo_settings: ['Undo settings', 'Restore previous settings if they still match Wisp’s applied changes.'],
  query_character: ['Character readings', 'Read talents, spells, quests, gear and bags on demand. Basic identity and location still accompany messages.'],
  inspect_reference: ['Inspect references', 'Read item, spell, talent and quest details from the game.'],
  query_progression: ['Quest progression', 'Read active quests, completion flags and reputations.'],
  inspect_target: ['Inspect target', 'Read the selected NPC or enemy.'],
  inspect_trainer: ['Inspect trainer', 'Read offers from the trainer window currently open.'],
  compare_items: ['Compare equipment', 'Compare item stats with current equipment.'],
  query_resources: ['Read resources', 'Read money, bag contents, free space and skill ranks.'],
  inspect_auctions: ['Read auction results', 'Read already-loaded results while the auction house is open.'],
  inspect_macros: ['Read macros', 'Read macro names and available slots; optionally inspect code.'],
  inspect_map: ['Read maps', 'Read the current pin and verify localized map names and IDs before marking a destination.'],
  set_map_waypoint: ['Mark map', 'Place a verified destination on the map, with optional navigation. Does not move the character.'],
  clear_map_waypoint: ['Undo map marker', 'Remove Wisp’s marker and restore the prior pin.'],
  create_macro: ['Create macros', 'Create new macros outside combat. Existing macros are not changed or executed.'],
  web_search: ['Web search', 'Search the web for sources and guides.'],
  set_conversation_title: ['Conversation titles', 'Let the assistant generate conversation titles.'],
};
export function defaultCapabilities(): Capability[] {
  return [
    ...Object.entries(toolDescriptions).map(([name, [label, description]]) => ({ id: 'tool:' + name, name: label, group: 'tools' as const, description })),
    { id: 'memory:preferences', name: 'Player preferences', group: 'memory', description: 'Recall and update saved preferences across characters. Disabling this preserves existing notes.' },
    { id: 'memory:character', name: 'Character plans', group: 'memory', description: 'Recall and update this character’s guide and goals. Disabling this preserves existing notes.' },
    { id: 'mcp:everloot', name: 'Everloot', group: 'mcps', description: 'WoW Forever database and market history. https://everloot.app/mcp/public' },
    ...everlootTools.map(name => ({ id: 'mcp_tool:everloot:' + name, name: name.replace(/_/g, ' '), group: 'mcps' as const, parent: 'mcp:everloot', description: 'Everloot tool: ' + name })),
  ];
}
export async function readCapabilityFlags(file?: string): Promise<Record<string, boolean>> {
  if (!file) return {};
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (!data || typeof data.enabled !== 'object' || Array.isArray(data.enabled) || data.enabled === null || Object.values(data.enabled).some(value => typeof value !== 'boolean')) throw new Error('Invalid capability settings; the file was preserved');
    return data.enabled;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}
export async function capabilityEnabled(id: string, defaultEnabled = true): Promise<boolean> {
  const flags = await readCapabilityFlags(process.env.WOW_CAPABILITIES_FILE);
  return flags[id] ?? defaultEnabled;
}
export async function connectionTools(name: string, tools: readonly string[]): Promise<string[]> {
  const flags = await readCapabilityFlags(process.env.WOW_CAPABILITIES_FILE);
  return tools.filter(tool => flags['mcp_tool:' + name + ':' + tool] !== false);
}
export class CapabilitySettings {
  file: string; catalog: Capability[]; flags: Record<string, boolean> = {};
  queue: Promise<unknown> = Promise.resolve();
  constructor(file: string, catalog = defaultCapabilities()) { this.file = file; this.catalog = catalog; }
  async load() { this.flags = await readCapabilityFlags(this.file); }
  enabled(id: string) { const entry = this.catalog.find(entry => entry.id === id); return this.flags[id] ?? entry?.defaultEnabled ?? true; }
  snapshot() { return this.catalog.map(entry => ({ ...entry, enabled: this.enabled(entry.id), effective: this.enabled(entry.id) && (!entry.parent || this.enabled(entry.parent)) })); }
  async set(id: string, enabled: boolean) {
    if (!this.catalog.some(entry => entry.id === id) || typeof enabled !== 'boolean') throw new Error('Unknown capability or invalid setting');
    const operation = this.queue.catch(() => {}).then(async () => {
      const next = { ...this.flags, [id]: enabled };
      await mkdir(path.dirname(this.file), { recursive: true });
      const temp = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify({ enabled: next }, null, 2)); await rename(temp, this.file);
      this.flags = next;
    });
    this.queue = operation; await operation;
  }
}
