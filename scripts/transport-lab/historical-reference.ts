// Historical codecs stay in ignored reference snapshots, outside shipped sources.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../packages/protocol/package.json', import.meta.url));

export async function historicalProtocol() {
  const argument = process.argv
    .find((value) => value.startsWith('--reference-protocol='))
    ?.slice('--reference-protocol='.length);
  const sourcePath = path.resolve(
    root,
    argument || 'runtime/bridge-research/deploy-before-v2-20261108_224025/protocol.js',
  );
  let source: string;
  try {
    source = await readFile(sourcePath, 'utf8');
  } catch (error) {
    throw new Error(
      'Historical comparison requires an external protocol snapshot. Supply --reference-protocol=FILE; reference codecs are not shipped with Wisp.',
      { cause: error },
    );
  }
  const sha256 = createHash('sha256').update(source).digest('hex');
  const directory = path.join(root, 'runtime/bridge-research/reference-modules');
  await mkdir(directory, { recursive: true });
  const modulePath = path.join(directory, `protocol-${sha256}-${process.pid}.ts`);
  // Resolve the existing dependency without changing or copying any codec logic.
  const zod = pathToFileURL(require.resolve('zod')).href;
  await writeFile(modulePath, source.replace(/(['"])zod\1/g, JSON.stringify(zod)), 'utf8');
  return { sourcePath, sha256, moduleUrl: pathToFileURL(modulePath).href };
}

export async function historicalDecoder() {
  const reference = await historicalProtocol();
  const module = await import(reference.moduleUrl);
  if (typeof module.FrameDecoder !== 'function') {
    throw new Error('The historical protocol snapshot must export FrameDecoder.');
  }
  const Decoder = module.FrameDecoder as new () => {
    add(frame: Buffer): Record<string, unknown> | null;
  };
  return { reference, Decoder };
}

export function historicalHostSource(source: string, reference: { moduleUrl: string }) {
  return source
    .replace(
      /import\s*\{([^}]+)\}\s*from\s*(['"])@wisp\/protocol\/protocol\2/g,
      (_match, members: string) => {
        const imports = members
          .split(',')
          .map((member) => member.trim())
          .filter(Boolean);
        const framing = imports.filter((member) => /^(FrameDecoder|parseFrame)$/.test(member));
        const application = imports.filter((member) => !framing.includes(member));
        return [
          framing.length
            ? `import { ${framing.join(', ')} } from ${JSON.stringify(reference.moduleUrl)}`
            : '',
          application.length
            ? `import { ${application.join(', ')} } from ${JSON.stringify(new URL('../../packages/protocol/src/protocol.ts', import.meta.url).href)}`
            : '',
        ]
          .filter(Boolean)
          .join(';\n');
      },
    )
    .replace(
      /(['"])@wisp\/protocol\/([^'"]+)\1/g,
      (_match, quote: string, name: string) =>
        quote +
        new URL('../../packages/protocol/src/' + name + '.ts', import.meta.url).href +
        quote,
    );
}
