export interface ClassAdapter {
  token: string;
  engineClass: string;
  spec: string;
  resource: 'mana' | 'rage' | 'energy';
  families: string[];
  channels?: string[];
  requiredTalents?: Record<string, number>;
  areaRanges?: Record<string, number>;
  dots?: string[];
  requiresRangedAuto?: boolean;
  melee?: boolean;
  wand?: boolean;
  options?: Record<string, unknown>;
  assumptions: string[];
}
export interface SpellRank {
  id: number;
  level: number;
  minRange: number;
  maxRange: number;
}
export interface ClassMetadata {
  talents: { id: number; max: number }[][];
  ranks: Record<string, SpellRank[]>;
  triggerParents: Record<string, number>;
}
