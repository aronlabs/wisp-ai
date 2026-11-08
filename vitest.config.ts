import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/runtime/**',
        '**/.eve/**',
        '**/dist/**',
        '**/dist-ui/**',
        '**/src-tauri/target/**',
        '**/src-tauri/resources/**',
        '**/src-tauri/gen/**',
      ],
    },
  },
  test: {
    projects: [
      { test: { name: 'core', environment: 'node', include: ['tests/**/*.test.ts'] } },
      { test: { name: 'addon', environment: 'node', include: ['addon/tests/**/*.test.ts'] } },
      'apps/desktop/vitest.config.ts',
    ],
    watchTriggerPatterns: [
      {
        pattern: /(?:^|\/)addon\/(?:WispAI\/.*|tests\/.*)\.lua$/,
        testsToRun: () =>
          readdirSync('addon/tests')
            .filter((file) => file.endsWith('.test.ts'))
            .map((file) => 'addon/tests/' + file),
      },
    ],
  },
});
