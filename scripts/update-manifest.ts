import { readFile, writeFile } from 'node:fs/promises';

export function updateManifest(version: string, signature: string, notes = '') {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw Error('Stable updates require a release version without a prerelease suffix.');
  }
  if (!signature.trim()) {
    throw Error('The update signature is missing.');
  }
  return {
    version,
    notes: notes || `Release notes: https://github.com/fedeya/wisp-ai/releases/tag/v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: signature.trim(),
        url: `https://github.com/fedeya/wisp-ai/releases/download/v${version}/WispAI-${version}-windows-x64-setup.exe`,
      },
    },
  };
}

export async function writeUpdateManifest(version: string, installer: string) {
  const signature = await readFile(installer + '.sig', 'utf8');
  await writeFile(
    'dist/latest.json',
    JSON.stringify(updateManifest(version, signature), null, 2) + '\n',
  );
}
