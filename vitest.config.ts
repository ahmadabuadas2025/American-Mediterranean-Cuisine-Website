import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs in tests/e2e run with `npm run test:e2e`.
export default defineConfig({ test: { include: ['tests/*.test.ts'] } });
