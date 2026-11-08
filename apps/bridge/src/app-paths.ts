import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { cp, mkdir, readlink, symlink, unlink, rm } from 'node:fs/promises';

export function appPaths(root: string, data = process.env.WISP_DATA_DIR) {
  const agent = path.dirname(fileURLToPath(import.meta.resolve('@wisp/agent/package.json')));
  const dataRoot = data ? path.resolve(data) : root;
  return {
    root,
    agent,
    dataRoot,
    runtime: path.join(dataRoot, 'runtime'),
    config: path.join(dataRoot, 'config.local.json'),
    engine: data ? path.join(dataRoot, 'engine') : agent,
  };
}

export async function prepareEngine(root: string, engine: string) {
  if (root === engine) {
    return;
  }
  await mkdir(engine, { recursive: true });
  for (const name of ['src', 'agent', 'package.json']) {
    if (name !== 'package.json') {
      const target = path.resolve(engine, name);
      if (path.dirname(target) !== path.resolve(engine) || target === path.resolve(root)) {
        throw Error('Invalid engine code directory.');
      }
      await rm(target, { recursive: true, force: true });
    }
    await cp(path.join(root, name), path.join(engine, name), { recursive: true });
  }
  // Deployed dependencies can be hoisted; find the nearest package dependency directory.
  let directory = root;
  let target = '';
  while (true) {
    try {
      await access(path.join(directory, 'node_modules'));
      target = path.join(directory, 'node_modules');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw Error('Cannot locate agent dependencies.');
    }
    directory = parent;
  }
  const link = path.join(engine, 'node_modules');
  try {
    if (path.resolve(await readlink(link)) === target) {
      return;
    }
    await unlink(link);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}
