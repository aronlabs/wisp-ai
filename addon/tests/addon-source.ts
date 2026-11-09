import { readFileSync } from 'node:fs';
export function addonSource(file: string): string {
  const dependencies =
    file === 'UI.lua'
      ? [
          'Widgets.lua',
          'EmojiData.lua',
          'Emoji.lua',
          'MessageFormat.lua',
          'ModelControls.lua',
          'MessageRows.lua',
        ]
      : [];
  return (
    dependencies
      .map(
        (name) =>
          `assert(load(${JSON.stringify(readFileSync('addon/WispAI/' + name, 'utf8'))}))('WispAI', C)`,
      )
      .join('\n') +
    '\n' +
    readFileSync('addon/WispAI/' + file, 'utf8')
  );
}
