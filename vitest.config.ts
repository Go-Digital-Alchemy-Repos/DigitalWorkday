import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/tests/**/*.test.ts"],
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
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
