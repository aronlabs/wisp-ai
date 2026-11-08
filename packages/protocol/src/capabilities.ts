export interface Capability {
  id: string;
  name: string;
  group: 'tools' | 'mcps' | 'memory';
  description: string;
  parent?: string;
  defaultEnabled?: boolean;
}
export const everlootTools = [
  'search_knowledge',
  'item_page',
  'npc_page',
  'object_page',
  'quest_page',
  'vendor_page',
  'world_map_near',
  'entity_relations',
  'item_categories',
  'talent_tree',
  'talent_plan',
  'class_races',
  'profession_path',
  'recipe_thresholds',
  'market_value',
  'auction_history',
  'coverage',
  'recent_changes',
];
export const toolDescriptions: Record<string, [string, string]> = {
  find_npc_locations: [
    'Find NPC locations',
    'Read NPC, class-trainer and city-service locations from installed QuestieDB Forever, with native map validation and source provenance.',
  ],
  simulate_dps: [
    'Simulate DPS',
    'Run the local experimental WoWSims Forever levelsim engine with fresh mage state at levels 1–60. Single-target Frostbolt or Fireball scenarios.',
  ],
  search_database: [
    'Search Forever database',
    'Search the primary TheWoWDB catalog for Forever items, spells, quests, NPCs and zones.',
  ],
  get_database_entity: [
    'Read Forever database',
    'Read a verified Forever catalog record with build, attribution and source links.',
  ],
  manage_panel: [
    'Persistent panels',
    'Create, read, edit and remove character-specific native panels with local live data bindings.',
  ],
  get_settings: [
    'Read settings',
    'Discover live game and registered AceConfig options; read addons, action bars and keybindings.',
  ],
  update_settings: [
    'Change settings',
    'Preview or apply verified settings proposals through native APIs and addon setters. No addon source edits.',
  ],
  undo_settings: [
    'Undo settings',
    'Restore previous settings if they still match Wisp’s applied changes.',
  ],
  query_character: [
    'Character readings',
    'Read talents, spells, quests, gear and bags on demand. Basic identity and location still accompany messages.',
  ],
  inspect_reference: [
    'Inspect references',
    'Read item, spell, talent and quest details from the game.',
  ],
  query_progression: ['Quest progression', 'Read active quests, completion flags and reputations.'],
  inspect_target: ['Inspect target', 'Read the selected NPC or enemy.'],
  inspect_trainer: ['Inspect trainer', 'Read offers from the trainer window currently open.'],
  compare_items: ['Compare equipment', 'Compare item stats with current equipment.'],
  query_resources: ['Read resources', 'Read money, bag contents, free space and skill ranks.'],
  inspect_auctions: [
    'Read auction results',
    'Read already-loaded results while the auction house is open.',
  ],
  inspect_macros: ['Read macros', 'Read macro names and available slots; optionally inspect code.'],
  inspect_map: [
    'Read maps',
    'Read the current pin and verify localized map names and IDs before marking a destination.',
  ],
  set_map_waypoint: [
    'Mark map',
    'Place a verified destination on the map, with optional navigation. Does not move the character.',
  ],
  clear_map_waypoint: ['Undo map marker', 'Remove Wisp’s marker and restore the prior pin.'],
  create_macro: [
    'Create macros',
    'Create new macros outside combat. Existing macros are not changed or executed.',
  ],
  web_search: [
    'Wowhead Forever search',
    'Fallback search limited to verified Wowhead Forever pages; other-version summaries are rejected.',
  ],
  set_conversation_title: [
    'Conversation titles',
    'Let the assistant generate conversation titles.',
  ],
};
export function defaultCapabilities(): Capability[] {
  return [
    ...Object.entries(toolDescriptions).map(([name, [label, description]]) => ({
      id: 'tool:' + name,
      name: label,
      group: 'tools' as const,
      description,
    })),
    {
      id: 'memory:preferences',
      name: 'Player preferences',
      group: 'memory',
      description:
        'Recall and update saved preferences across characters. Disabling this preserves existing notes.',
    },
    {
      id: 'memory:character',
      name: 'Character plans',
      group: 'memory',
      description:
        'Recall and update this character’s guide and goals. Disabling this preserves existing notes.',
    },
    {
      id: 'mcp:everloot',
      name: 'Everloot',
      group: 'mcps',
      description:
        'Complementary Forever observations and market history. Search version is enforced. https://everloot.app/mcp/public',
    },
    ...everlootTools.map((name) => ({
      id: 'mcp_tool:everloot:' + name,
      name: name.replace(/_/g, ' '),
      group: 'mcps' as const,
      parent: 'mcp:everloot',
      description: 'Everloot tool: ' + name,
    })),
  ];
}
