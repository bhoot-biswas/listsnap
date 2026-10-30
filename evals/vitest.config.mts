import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Evals call live Meta models with MODEL_API_KEY, so they run only by hand
 * (`pnpm eval:chat`), never in `pnpm test` or CI.
 */
const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      "server-only": path.join(root, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    testTimeout: 180_000,
    // a few requests at a time: quick, and well under the API's rate limit
    maxConcurrency: 4,
  },
});
