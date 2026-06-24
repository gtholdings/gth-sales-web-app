import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(srcDir, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/lib/__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scope coverage to the pure/business-logic lib modules we target.
      include: [
        'src/lib/installments.js',
        'src/lib/sale-status.js',
        'src/lib/format.js',
        'src/lib/phone.js',
        'src/lib/config.js',
        'src/lib/datetime.js',
        'src/lib/reports.js',
        'src/lib/scope-query.js',
        'src/lib/excel.js',
      ],
    },
  },
});
