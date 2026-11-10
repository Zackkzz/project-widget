import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react()],
  envDir: false,
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./app/widget.html', import.meta.url)) },
  },
  server: {
    port: 5173,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('./app', import.meta.url)),
        fileURLToPath(new URL('./node_modules', import.meta.url)),
      ],
      deny: ['.env', '.env.*', '*.pem', '*.ds', '**/.git/**'],
    },
  },
  test: {
    root: '.',
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
  },
});
