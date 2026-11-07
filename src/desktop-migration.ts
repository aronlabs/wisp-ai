import { access, cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function migrateDesktop(
  source: string,
  destination: string,
  localAppData = process.env.LOCALAPPDATA,
) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  if (source === destination) {
    throw Error('Choose the previous Wisp installation folder.');
  }
  try {
    await access(path.join(destination, 'config.local.json'));
    throw Error('This installation is already configured; no data was overwritten.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const config = JSON.parse(await readFile(path.join(source, 'config.local.json'), 'utf8'));
  if (typeof config.wow !== 'string') {
    throw Error('This folder does not contain a Wisp installation.');
  }
  await mkdir(path.join(destination, 'runtime'), { recursive: true });
  const allowed = [
    'chats.json',
    'memory',
    'mcp.json',
    'panels.json',
    'suggestions.json',
    'capabilities.json',
    'advice-history.json',
    'chatgpt-host.json',
  ];
  for (const name of allowed) {
    try {
      await cp(path.join(source, 'runtime', name), path.join(destination, 'runtime', name), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  if (localAppData) {
    const hash = createHash('sha256').update(source).digest('hex');
    const secrets = path.join(localAppData, 'WispAI', 'Secrets', hash);
    let entries: string[] = [];
    try {
      entries = await readdir(secrets);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    await mkdir(path.join(destination, 'secrets'), { recursive: true });
    for (const name of entries.filter((name) => /^[a-f0-9]{64}\.bin$/.test(name))) {
      await cp(path.join(secrets, name), path.join(destination, 'secrets', name), {
        force: false,
        errorOnExist: true,
      });
    }
  }
  // Commit configuration last: a failed import never starts a partially migrated account.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    path.join(destination, 'config.local.json'),
    JSON.stringify({ wow: config.wow, model: config.model || '' }, null, 2),
    { flag: 'wx' },
  );
}
