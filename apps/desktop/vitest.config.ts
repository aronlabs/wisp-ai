import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./node_modules/.cache/vitest', import.meta.url)),
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  resolve: { conditions: ['browser'] },
  server: { watch: { ignored: ['**/src-tauri/**', '**/dist/**'] } },
  test: { name: 'desktop', environment: 'jsdom', include: ['src/**/*.test.ts'], maxWorkers: 2 },
});
