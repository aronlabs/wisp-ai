import { readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { migrateReplies } from '@wisp/bridge/migrate-replies';
const file = new URL('../runtime/chats.json', import.meta.url);
const chats = JSON.parse(await readFile(file, 'utf8'));
if (chats.some((chat: { status: string }) => chat.status === 'working')) {
  throw new Error('Wait for active turns before migrating.');
}
const backup = new URL('./chats.before-rich-stream-' + Date.now() + '.json', file);
await copyFile(file, backup);
const result = migrateReplies(chats);
const temporary = new URL('./chats.migrating.json', file);
await writeFile(temporary, JSON.stringify(chats, null, 2));
await rename(temporary, file);
console.log(JSON.stringify({ ...result, backup: backup.pathname }));
