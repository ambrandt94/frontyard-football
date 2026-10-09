import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/frontyard-football/',
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
