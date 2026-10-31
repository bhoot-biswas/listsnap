import { beforeEach, describe, expect, it, vi } from "vitest";

const locale = vi.hoisted(() => ({ current: "en" }));
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }));

const { fail, notFound } = await import("./http");

describe("route errors", () => {
  beforeEach(() => {
    locale.current = "en";
  });

  it("answers in English for an English UI", async () => {
    const res = await fail(413, "too_large", "photoTooLarge", { mb: 15 });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: { code: "too_large", message: "That photo is over 15 MB. Try a smaller one." },
    });
  });

  it("answers in Bangla, with Bangla digits, for a Bangla UI; the code stays the same", async () => {
    locale.current = "bn";
    const res = await fail(413, "too_large", "photoTooLarge", { mb: 15 });
    expect(await res.json()).toEqual({
      error: { code: "too_large", message: "ছবিটি ১৫ MB-এর বেশি। একটু ছোট ছবি দিয়ে চেষ্টা করুন।" },
    });
    expect((await (await notFound()).json()).error).toEqual({ code: "not_found", message: "এটি আপনার দোকানে নেই।" });
  });
});
