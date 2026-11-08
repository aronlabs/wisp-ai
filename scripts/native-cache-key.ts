import { appendFile } from 'node:fs/promises';
import { nativeBuildContext, nativeBuildKey } from './native-cache.ts';

if (process.env.TAURI_CONFIG) {
  throw Error('Release caching requires the checked-in Tauri configuration.');
}
const key = await nativeBuildKey(process.cwd(), nativeBuildContext());
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, 'key=' + key + '\n');
}
console.log(key);
