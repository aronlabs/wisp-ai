import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte({ configFile: './svelte.config.js' })],
  resolve: { conditions: ['browser'] },
  test: { environment: 'jsdom', include: ['app/**/*.test.ts'] },
});
