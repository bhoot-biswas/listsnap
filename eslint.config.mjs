import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A helper left below a `return` still type-checks, and the minifier drops it as dead
  // code; the page then breaks at runtime when that branch renders (seen in SOHOZ TOOLS).
  { rules: { "no-unreachable": "error" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // local-only planning and spike scripts (gitignored)
    "docs/**",
  ]),
]);

export default eslintConfig;
