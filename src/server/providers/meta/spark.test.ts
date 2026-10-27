import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ListingText, PlanResult } from "@/lib/schemas/pipeline";
import { StepError } from "@/server/pipeline/run-step";

beforeAll(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllGlobals());

const { BUSY, UNREADABLE, sparkJson, strictSchema } = await import("./spark");

const plan: PlanResult = {
  sam_phrase: "jamdani saree",
  alt_phrases: ["saree"],
  category_guess: "Sarees",
  likely_multi: false,
  item_count_guess: 1,
  multi_kind: "single",
  camera_angle: "top_down",
  photo_notes: "Even light.",
};

const completion = (content: string) =>
  Response.json({
    model: "muse-spark-1.3",
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 4000, completion_tokens: 1000 },
  });

const stubFetch = (...responses: (Response | Error)[]) => {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
};

const call = () => sparkJson({ name: "PlanResult", schema: PlanResult, system: "s", userText: "u" });

describe("strictSchema", () => {
  it("stays inside Spark's strict subset", () => {
    const s = JSON.stringify(strictSchema(ListingText));
    for (const k of ["$schema", "minLength", "minimum", "maximum"]) expect(s).not.toContain(`"${k}"`);
    const root = strictSchema(ListingText) as { required: string[]; additionalProperties: boolean };
    expect(root.additionalProperties).toBe(false);
    expect(root.required).toEqual(Object.keys(ListingText.shape));
  });
});

describe("sparkJson", () => {
  it("returns the parsed answer with its cost", async () => {
    const fetch = stubFetch(completion(JSON.stringify(plan)));
    const r = await call();
    expect(r.data).toEqual(plan);
    expect(r.requests).toBe(1);
    expect(r.costUsd).toBe(0.00925);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.response_format.json_schema).toMatchObject({ name: "PlanResult", strict: true });
  });

  it("asks once more after an unreadable answer", async () => {
    stubFetch(completion("not json"), completion(JSON.stringify(plan)));
    const r = await call();
    expect(r.requests).toBe(2);
    expect(r.costUsd).toBe(0.0185);
  });

  it("gives the seller a StepError after two unreadable answers", async () => {
    stubFetch(completion(JSON.stringify({ ...plan, sam_phrase: "" })), completion("{}"));
    await expect(call()).rejects.toThrow(new StepError(UNREADABLE));
  });

  it("calls rate limits, server errors and timeouts busy", async () => {
    for (const r of [new Response("", { status: 429 }), new Response("", { status: 503 }), new Error("timeout")]) {
      stubFetch(r);
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(StepError);
      expect(err.message).toBe(BUSY);
    }
  });

  it("keeps a rejected request out of the seller's view", async () => {
    stubFetch(new Response("bad schema", { status: 400 }));
    const err = await call().catch((e) => e);
    expect(err).not.toBeInstanceOf(StepError);
    expect(err.message).toContain("HTTP 400");
  });
});
