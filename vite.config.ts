import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/frontyard-football/',
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
