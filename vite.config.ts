import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  root: 'app',
  plugins: [svelte({ configFile: '../svelte.config.js' })],
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { outDir: '../dist-ui', emptyOutDir: true, target: ['es2022', 'chrome105', 'safari15'] },
});
