export interface CatalogItem {
  id: number;
  name: string;
  type: number;
  armorType?: number;
  weaponType?: number;
  handType?: number;
  rangedWeaponType?: number;
  reqLvl?: number;
  classAllowlist?: number[];
  unique?: boolean;
  limitCategory?: number;
  requiredProfession?: number;
  factionRestriction?: number;
}
export interface EquippedItem {
  slot: number;
  id: number;
  link: string;
}
export const equipmentSlots = [1, 2, 3, 15, 5, 9, 10, 6, 7, 8, 11, 12, 13, 14, 16, 17, 18];
const slotTypes: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  15: 4,
  5: 5,
  9: 6,
  10: 7,
  6: 8,
  7: 9,
  8: 10,
  11: 11,
  12: 11,
  13: 12,
  14: 12,
  16: 13,
  17: 13,
  18: 14,
};
// The adapter accepts only these validated class equipment capabilities.
const capabilities: Record<
  string,
  { id: number; armor: number; weapons: number[]; twoHand: number[]; ranged: number[] }
> = {
  WARRIOR: {
    id: 1,
    armor: 4,
    weapons: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    twoHand: [1, 4, 6, 8, 9],
    ranged: [1, 2, 3, 4],
  },
  PALADIN: { id: 2, armor: 4, weapons: [1, 4, 5, 6, 7, 9], twoHand: [1, 4, 6, 9], ranged: [7] },
  HUNTER: {
    id: 3,
    armor: 3,
    weapons: [1, 2, 3, 6, 8, 9],
    twoHand: [1, 6, 8, 9],
    ranged: [1, 2, 3],
  },
  ROGUE: { id: 4, armor: 2, weapons: [1, 2, 3, 4, 5, 9], twoHand: [], ranged: [1, 2, 3, 4] },
  PRIEST: { id: 5, armor: 1, weapons: [2, 4, 5, 8], twoHand: [8], ranged: [5] },
  SHAMAN: { id: 7, armor: 3, weapons: [1, 2, 3, 4, 5, 7, 8], twoHand: [1, 4, 8], ranged: [8] },
  MAGE: { id: 8, armor: 1, weapons: [2, 5, 8, 9], twoHand: [8], ranged: [5] },
  WARLOCK: { id: 9, armor: 1, weapons: [2, 5, 8, 9], twoHand: [8], ranged: [5] },
  DRUID: { id: 11, armor: 2, weapons: [2, 3, 4, 5, 6, 8], twoHand: [4, 6, 8], ranged: [6] },
};

export function replaceEquipment(
  equipped: EquippedItem[],
  replacements: { slot: number; itemId: number }[],
  catalog: Map<number, CatalogItem>,
  token: string,
  level: number,
  race: string,
) {
  const result = new Map(equipped.map((i) => [i.slot, { ...i }]));
  if (result.size !== equipped.length) {
    throw Error('The gear reading contains duplicate slots.');
  }
  const seen = new Set<number>();
  const caps = capabilities[token];
  for (const replacement of replacements) {
    const { slot, itemId } = replacement;
    if (!equipmentSlots.includes(slot) || seen.has(slot)) {
      throw Error('Invalid or duplicate replacement slot.');
    }
    seen.add(slot);
    if (!itemId) {
      result.delete(slot);
      continue;
    }
    const item = catalog.get(itemId);
    if (!item) {
      throw Error('Candidate item ' + itemId + ' is absent from the pinned simulator database.');
    }
    if (item.type !== slotTypes[slot]) {
      throw Error('Candidate item does not fit slot ' + slot + '.');
    }
    if ((item.reqLvl ?? 0) > level) {
      throw Error('Candidate item requires a higher level.');
    }
    if (item.classAllowlist?.length && !item.classAllowlist.includes(caps.id)) {
      throw Error('Candidate item is restricted to another class.');
    }
    if (item.requiredProfession) {
      throw Error('Candidate profession requirements cannot be verified by this snapshot.');
    }
    const faction = ['Human', 'Dwarf', 'NightElf', 'Gnome'].includes(race) ? 1 : 2;
    if (item.factionRestriction && item.factionRestriction !== faction) {
      throw Error('Candidate item belongs to the other faction.');
    }
    const armor = level < 40 && [1, 2, 3, 7].includes(caps.id) ? caps.armor - 1 : caps.armor;
    if ((item.armorType ?? 0) > armor) {
      throw Error('Candidate armor type is unavailable for this class and level.');
    }
    if (item.type === 14 && !caps.ranged.includes(item.rangedWeaponType ?? 0)) {
      throw Error('Candidate ranged weapon is unavailable for this class.');
    }
    if (item.type === 13) {
      const weapon = item.weaponType ?? 0;
      if (!caps.weapons.includes(weapon)) {
        throw Error('Candidate weapon type is unavailable for this class.');
      }
      if (slot === 16 && (item.handType === 3 || [5, 7].includes(weapon))) {
        throw Error('Off-hand item cannot go in the main hand.');
      }
      if (slot === 17 && [1, 4].includes(item.handType ?? 0)) {
        throw Error('Main-hand/two-handed weapon cannot go in the off hand.');
      }
      if (item.handType === 4 && !caps.twoHand.includes(weapon)) {
        throw Error('Two-handed weapon type is unavailable for this class.');
      }
      if (
        slot === 17 &&
        ![5, 7].includes(weapon) &&
        !(token === 'ROGUE' || (['WARRIOR', 'HUNTER'].includes(token) && level >= 20))
      ) {
        throw Error('Dual wield is not validated for this class and level.');
      }
    }
    // Replacements are base catalog items: never transfer the old item's enchant or suffix.
    result.set(slot, { slot, id: itemId, link: 'item:' + itemId });
  }
  const main = catalog.get(result.get(16)?.id ?? 0);
  if (main?.handType === 4 && result.has(17)) {
    throw Error('A two-handed weapon requires an explicit removal of the off hand (itemId: 0).');
  }
  const counts = new Map<number, number>();
  const categories = new Set<number>();
  for (const item of result.values()) {
    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    if (catalog.get(item.id)?.unique && counts.get(item.id)! > 1) {
      throw Error('A unique item cannot be equipped twice.');
    }
    const category = catalog.get(item.id)?.limitCategory;
    if (category && categories.has(category)) {
      throw Error('These items share a unique-equipped limit category.');
    }
    if (category) {
      categories.add(category);
    }
  }
  return [...result.values()];
}
