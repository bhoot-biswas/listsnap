import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StepError } from "@/server/pipeline/run-step";

beforeAll(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllGlobals());

const { BLOCKED, editImage, endUser, generateImage, imagesBody } = await import("./image");
const { BUSY } = await import("./spark");

const stubFetch = (response: Response) => {
  const fn = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fn);
  return fn;
};
const sentBody = (fn: ReturnType<typeof vi.fn>) => JSON.parse(fn.mock.calls[0]![1].body as string);
const image = Response.json({
  data: [{ b64_json: Buffer.from("jpeg").toString("base64") }],
  usage: { total_tokens: 4530 },
});

describe("imagesBody", () => {
  it("turns the built-in search and shell off and asks for JPEG", () => {
    const body = imagesBody({ prompt: "p", size: "1024x1024" }, { reasoning: "low", user: "u" });
    expect(body).toMatchObject({
      model: "muse-image-1.0",
      n: 1,
      output_format: "jpeg",
      reasoning_strength: "low",
      user: "u",
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    });
  });
});

describe("endUser", () => {
  it("is stable per workspace and doesn't reveal the id", () => {
    expect(endUser("ws-1")).toBe(endUser("ws-1"));
    expect(endUser("ws-1")).not.toBe(endUser("ws-2"));
    expect(endUser("ws-1")).not.toContain("ws-1");
  });
});

describe("generateImage and editImage", () => {
  it("draws backgrounds in one low pass and edits at high", async () => {
    const gen = stubFetch(image.clone());
    const r = await generateImage("backdrop", "1024x1024", "u");
    expect(sentBody(gen)).toMatchObject({ reasoning_strength: "low", prompt: "backdrop" });
    expect(r).toEqual({ image: Buffer.from("jpeg"), tokens: 4530 });

    const edit = stubFetch(image.clone());
    await editImage("data:image/jpeg;base64,AAAA", "scene", "u");
    expect(sentBody(edit)).toMatchObject({
      reasoning_strength: "high",
      images: [{ image_url: "data:image/jpeg;base64,AAAA" }],
    });
  });

  it("tells the seller when a photo is blocked", async () => {
    stubFetch(
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "content_policy_violation",
            param: "prompt",
            message: "blocked",
          },
        },
        { status: 400 },
      ),
    );
    const err = await generateImage("p", "1024x1024", "u").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe(BLOCKED);
  });

  it("keeps other 400s server-side", async () => {
    stubFetch(Response.json({ error: { code: "unknown_parameter", message: "seed" } }, { status: 400 }));
    const err = await generateImage("p", "1024x1024", "u").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(StepError);
  });

  it("calls a retryable 503 busy", async () => {
    stubFetch(new Response("down", { status: 503 }));
    await expect(generateImage("p", "1024x1024", "u")).rejects.toThrow(BUSY);
  });
});
