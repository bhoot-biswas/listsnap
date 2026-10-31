import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * next-intl only finds a missing key when the page renders, and then the page crashes.
 * These checks catch it in CI instead: English and Bangla have the same keys, and every
 * literal key the code asks for exists. Keys built at runtime (t(`kinds.${k}`)) are not
 * checked here.
 */

type Messages = { [key: string]: string | Messages };
const root = path.resolve(import.meta.dirname, "..");
const load = (lang: string) =>
  JSON.parse(readFileSync(path.join(root, "messages", `${lang}.json`), "utf8")) as Messages;

const keys = (m: Messages, prefix = ""): string[] =>
  Object.entries(m).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`)));

const has = (m: Messages, key: string) =>
  key.split(".").reduce<string | Messages | undefined>((x, k) => (typeof x === "object" ? x[k] : undefined), m) !==
  undefined;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [p] : [];
  });
}

describe("messages", () => {
  const en = load("en");

  it("has the same keys in English and Bangla", () => {
    expect(keys(load("bn")).sort()).toEqual(keys(en).sort());
  });

  it("has every literal key the code asks for", () => {
    const binding = /const (\w+) = (?:await )?(?:use|get)Translations\((?:"([^"]*)")?\)/g;
    const missing: string[] = [];
    for (const file of sourceFiles(path.join(root, "src"))) {
      const src = readFileSync(file, "utf8");
      const binds = [...src.matchAll(binding)].map((m) => ({ at: m.index, name: m[1]!, ns: m[2] ?? "" }));
      for (const name of new Set(binds.map((b) => b.name))) {
        for (const call of src.matchAll(new RegExp(`\\b${name}(?:\\.rich)?\\("([^"\`$]+)"`, "g"))) {
          // the nearest translator above the call: one file can hold several components
          const bind = binds.filter((b) => b.name === name && b.at < call.index).at(-1);
          if (!bind) continue;
          const key = bind.ns ? `${bind.ns}.${call[1]}` : call[1]!;
          if (!has(en, key)) missing.push(`${path.relative(root, file)}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("media library labels", () => {
  it("has a label for every kind of photo the library shows", async () => {
    // the grid looks these up at runtime (t(`kinds.${kind}`)), which the check above can't see
    const { MEDIA_GROUPS } = await import("@/server/db/media-library");
    const kinds = Object.values(MEDIA_GROUPS).flat();
    for (const lang of ["en", "bn"])
      expect(
        kinds.filter((k) => !has(load(lang), `media.kinds.${k}`)),
        lang,
      ).toEqual([]);
  });
});

describe("connections labels", () => {
  it("names and describes every service, and every status, in both languages", async () => {
    // Connections builds these at runtime (t(`names.${service}`)), which the check above can't see
    const { SERVICES, SERVICE_GROUP } = await import("@/lib/connectors");
    const want = [
      ...SERVICES.flatMap((s) => [`names.${s}`, `desc.${s}`, `groups.${SERVICE_GROUP[s]}`]),
      ...["connected", "broken", "demo", "test", "none"].map((s) => `status.${s}`),
    ];
    for (const lang of ["en", "bn"])
      expect(
        want.filter((k) => !has(load(lang), `connections.${k}`)),
        lang,
      ).toEqual([]);
  });
});
