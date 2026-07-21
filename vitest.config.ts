import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "server/tests/**/*.test.ts",
      "server/__tests__/**/*.test.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
    ],
    setupFiles: ["server/tests/setup.ts"],
    testTimeout: 30000,
    // Run test files sequentially to avoid database conflicts
    fileParallelism: false,
    // Use single thread for database isolation
    sequence: {
      shuffle: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
