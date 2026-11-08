import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifySimulator(root: string) {
  const directory = path.join(root, 'simulator');
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const binary = await readFile(path.join(directory, 'wowsimcli.exe'));
  if (
    !binary.length ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    createHash('sha256').update(binary).digest('hex') !== manifest.sha256
  ) {
    throw Error('Simulator binary does not match its pinned manifest.');
  }
  for (const file of ['item-ids.json', 'mage-talents.json']) {
    if (!Array.isArray(JSON.parse(await readFile(path.join(directory, file), 'utf8')))) {
      throw Error('Invalid simulator metadata: ' + file);
    }
  }
}
