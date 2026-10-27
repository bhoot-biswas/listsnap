import { describe, expect, it } from "vitest";
import { signedMediaUrl, verifyMediaLink } from "./signed";

const WS = "11111111-1111-1111-1111-111111111111";
const MEDIA = "22222222-2222-2222-2222-222222222222";

const parts = (url: string) => {
  const u = new URL(url);
  return { name: u.pathname.split("/").pop()!, params: u.searchParams };
};

describe("signed media links", () => {
  it("open the one file they were made for", () => {
    const { name, params } = parts(signedMediaUrl(WS, MEDIA, "image/jpeg"));
    expect(name).toBe(`${MEDIA}.jpg`);
    expect(verifyMediaLink(MEDIA, params)).toBe(WS);
  });

  it("don't open another file or workspace", () => {
    const { params } = parts(signedMediaUrl(WS, MEDIA, "image/jpeg"));
    expect(verifyMediaLink("33333333-3333-3333-3333-333333333333", params)).toBeNull();
    params.set("w", "44444444-4444-4444-4444-444444444444");
    expect(verifyMediaLink(MEDIA, params)).toBeNull();
  });

  it("stop working once expired", () => {
    const { params } = parts(signedMediaUrl(WS, MEDIA, "image/png", 60));
    expect(verifyMediaLink(MEDIA, params, Date.now() + 61_000)).toBeNull();
  });
});
