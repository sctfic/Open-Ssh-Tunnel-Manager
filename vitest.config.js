import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
<<<<<<< HEAD
    testTimeout: 15_000,
=======
    testTimeout: 10_000,
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
})
