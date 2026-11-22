import { defineConfig } from 'vitest/config';

// Database tests run against the local Supabase stack (npm run db:start), so
// they're kept out of `npm test` / `npm run check`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Files share one database; running them one at a time keeps failures readable.
    fileParallelism: false,
  },
});
