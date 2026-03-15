import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/index.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      'entities': path.resolve(__dirname, './src/entities'),
      'constants': path.resolve(__dirname, './src/constants'),
      'config': path.resolve(__dirname, './src/config'),
      'database': path.resolve(__dirname, './src/database'),
      'errors': path.resolve(__dirname, './src/errors'),
      'repositories': path.resolve(__dirname, './src/repositories'),
      'services': path.resolve(__dirname, './src/services'),
      'utils': path.resolve(__dirname, './src/utils'),
      'middleware': path.resolve(__dirname, './src/middleware'),
      'controllers': path.resolve(__dirname, './src/controllers'),
    },
  },
});
