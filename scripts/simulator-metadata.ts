import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2]);
const output = path.join(root, 'simulator');
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
const spells = await readFile(path.join(source, 'sim/core/spelldata/spells_auto_gen.go'), 'utf8');
for (const ladder of Object.values(manifest.ranks) as { id: number; level: number }[][]) {
  for (const rank of ladder) {
    const row = spells.split('\n').find((l) => l.startsWith('\t{ID: ' + rank.id + ','));
    if (!row) {
      throw Error('Missing spell rank ' + rank.id);
    }
    rank.level = Number(row.match(/SpellLevel: (\d+)/)?.[1] || 1);
  }
}
const trees = JSON.parse(
  await readFile(path.join(source, 'ui/sim/talents/trees/mage.json'), 'utf8'),
);
await writeFile(
  path.join(output, 'mage-talents.json'),
  JSON.stringify(
    trees.map((t: any) => t.talents.map((x: any) => ({ id: x.spellId, max: x.maxPoints }))),
    null,
    2,
  ) + '\n',
);
const main = JSON.parse(await readFile(path.join(source, 'assets/database/db.json'), 'utf8'));
const leftover = JSON.parse(
  await readFile(path.join(source, 'assets/database/leftover_db.json'), 'utf8'),
);
manifest.wandIds = [
  ...new Set(
    [...main.items, ...leftover.items].filter((i) => i.rangedWeaponType === 5).map((i) => i.id),
  ),
];
manifest.triggerParents = {};
for (const rank of manifest.ranks.arcaneMissiles) {
  const start = spells.indexOf('\t{ID: ' + rank.id + ',');
  const end = spells.indexOf('\n\t{ID:', start + 1);
  const trigger = Number(spells.slice(start, end).match(/TriggerID: (\d+)/)?.[1]);
  if (!trigger) {
    throw Error('Missing Arcane Missiles trigger for rank ' + rank.id);
  }
  manifest.triggerParents[trigger] = rank.id;
}
await writeFile(
  path.join(output, 'item-ids.json'),
  JSON.stringify([...new Set([...main.items, ...leftover.items].map((i) => i.id))]) + '\n',
);
await copyFile(path.join(source, 'LICENSE'), path.join(output, 'LICENSE-WoWSims.txt'));
manifest.sha256 = createHash('sha256')
  .update(await readFile(path.join(output, 'wowsimcli.exe')))
  .digest('hex');
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
