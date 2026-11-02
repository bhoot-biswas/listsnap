import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Server Action is a public endpoint: anyone can call it with any arguments. Each one
 * must find out who is asking itself (AGENTS.md), so every exported function here has to
 * call requireWorkspace(), or optionalViewer() where signed-out callers are fine (the UI
 * language, which is only a cookie for them).
 */
const DIR = path.join(process.cwd(), "src/server/actions");
const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

/** Each exported function's own text, up to the next export. */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const parts = src.split(/^export async function /m).slice(1);
  return parts.map((p) => ({ name: p.slice(0, p.indexOf("(")), body: p.split(/^export /m)[0]! }));
}

describe("Server Actions", () => {
  it("are all found", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    const src = readFileSync(path.join(DIR, file), "utf8");
    it(`${file}: every exported action checks who is asking`, () => {
      expect(src.startsWith('"use server"')).toBe(true);
      const fns = exportedFunctions(src);
      expect(fns.length).toBeGreaterThan(0);
      for (const fn of fns)
        expect(fn.body, `${file} ${fn.name}() must call requireWorkspace() or optionalViewer()`).toMatch(
          /\b(requireWorkspace|optionalViewer)\(/,
        );
    });
  }
});
