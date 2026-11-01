import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Production must refuse to call itself healthy without the settings it can't work without. */
describe("configProblems", () => {
  afterEach(() => vi.unstubAllEnvs());
  const load = async (vars: Record<string, string>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    const { configProblems, env } = await import("./env");
    return configProblems(env());
  };
  const good = {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://getlistsnap.com",
    DATABASE_URL: "mysql://u:p@127.0.0.1:3306/listsnap",
    BETTER_AUTH_SECRET: "x".repeat(44),
    CREDENTIALS_KEY: Buffer.alloc(32, 7).toString("base64"),
    PROVIDER_MODE_META: "live",
    MODEL_API_KEY: "key",
  };

  it("passes a complete production setup", async () => {
    expect(await load(good)).toEqual([]);
  });

  it("names what's missing or wrong, never its value", async () => {
    expect(
      await load({
        ...good,
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "short",
        CREDENTIALS_KEY: "dG9vIHNob3J0",
        MODEL_API_KEY: "",
      }),
    ).toEqual(["NEXT_PUBLIC_SITE_URL", "BETTER_AUTH_SECRET", "CREDENTIALS_KEY", "MODEL_API_KEY"]);
  });

  it("asks nothing of a development machine", async () => {
    expect(await load({ NODE_ENV: "development", BETTER_AUTH_SECRET: "" })).toEqual([]);
  });
});
