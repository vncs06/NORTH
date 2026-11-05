import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.unit.test.ts', 'apps/**/*.unit.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
  },
});
