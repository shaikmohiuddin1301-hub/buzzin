import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    // Mirrors tsconfig `paths`: `@/db/*` resolves to the project-root db folder,
    // everything else under `@/` resolves inside src.
    alias: [
      { find: /^@\/db\//, replacement: `${path.resolve(__dirname, "db")}/` },
      { find: /^@\/db$/, replacement: path.resolve(__dirname, "db") },
      { find: /^@\//, replacement: `${path.resolve(__dirname, "src")}/` },
    ],
  },
});
