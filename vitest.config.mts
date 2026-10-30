import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server Component bundle; tests import server code directly
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // the *.db tests drive whole jobs against a database other test files use at the same
    // time; under that load a job can pass the 5 s default, and a beforeAll that makes the
    // suite's listing can pass the 10 s hook default
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
