import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

beforeAll(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllGlobals());

const { SamRejectedError, samBody, samSegment } = await import("./sam");

const photo = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#fff" } })
  .jpeg()
  .toBuffer();

describe("samBody", () => {
  it("asks for confidence and compact one_bit masks", () => {
    const body = samBody("jamdani saree", "data:image/jpeg;base64,AAAA");
    expect(body).toMatchObject({
      model: "sam-3.1",
      stream: true,
      metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    });
  });
});

describe("samSegment", () => {
  it("marks a refused request so the step can move on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(Response.json({ error: { message: "invalid prompt" } }, { status: 400 })),
    );
    await expect(samSegment(photo, "bus, bicycle")).rejects.toBeInstanceOf(SamRejectedError);
  });
});
