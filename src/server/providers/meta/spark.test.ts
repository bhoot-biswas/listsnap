import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ListingText, PlanResult } from "@/lib/schemas/pipeline";
import { StepError } from "@/server/pipeline/run-step";

beforeAll(() => {
  vi.stubEnv("MODEL_API_KEY", "test-key");
});
// the circuit breaker remembers failures across calls; each test starts closed
const { resetBreakers } = await import("../breaker");
afterEach(() => {
  vi.unstubAllGlobals();
  resetBreakers();
});

const { BUSY, UNREADABLE, sparkBody, sparkJson, strictSchema } = await import("./spark");
const { PermanentError } = await import("@/server/pipeline/run-step");

const plan: PlanResult = {
  sam_phrase: "jamdani saree",
  alt_phrases: ["saree"],
  contents_phrases: [],
  category_guess: "Sarees",
  likely_multi: false,
  item_count_guess: 1,
  multi_kind: "single",
  camera_angle: "top_down",
  photo_notes: "Even light.",
  scene_brief: { setting: "on a carved wooden chair by a window", palette: ["cream"], avoid: [] },
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

const call = () => sparkJson({ name: "PlanResult", schema: PlanResult, system: "s", userText: "u", effort: "low" });

describe("strictSchema", () => {
  it("stays inside Spark's strict subset", () => {
    const s = JSON.stringify(strictSchema(ListingText));
    for (const k of ["$schema", "minLength", "minimum", "maximum"]) expect(s).not.toContain(`"${k}"`);
    const root = strictSchema(ListingText) as { required: string[]; additionalProperties: boolean };
    expect(root.additionalProperties).toBe(false);
    expect(root.required).toEqual(Object.keys(ListingText.shape));
  });

  it("requires the plan's scene brief and all its fields, as strict mode needs", () => {
    const root = strictSchema(PlanResult) as {
      required: string[];
      properties: { scene_brief: { required: string[]; additionalProperties: boolean } };
    };
    expect(root.required).toContain("scene_brief");
    expect(root.properties.scene_brief.required).toEqual(["setting", "palette", "avoid"]);
    expect(root.properties.scene_brief.additionalProperties).toBe(false);
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
      expect(err.key).toBe(BUSY);
    }
  });

  it("keeps a rejected request out of the seller's view", async () => {
    stubFetch(new Response("bad schema", { status: 400 }));
    const err = await call().catch((e) => e);
    expect(err).not.toBeInstanceOf(StepError);
    expect(err.message).toContain("HTTP 400");
  });
});

describe("sparkBody", () => {
  it("sends the instructions as a developer message, its effort and a stable cache key", () => {
    const body = sparkBody({
      name: "PlanResult",
      schema: PlanResult,
      system: "rules",
      userText: "u",
      effort: "minimal",
    });
    expect(body).toMatchObject({
      reasoning_effort: "minimal",
      prompt_cache_key: "listsnap-PlanResult-v1",
      messages: [{ role: "developer", content: "rules" }, { role: "user" }],
    });
  });
});

describe("sparkJson errors", () => {
  it("marks a refused request permanent, so the step isn't retried", async () => {
    stubFetch(new Response("bad", { status: 400 }));
    await expect(call()).rejects.toBeInstanceOf(PermanentError);
  });

  it("adds up cached and reasoning tokens", async () => {
    stubFetch(
      Response.json({
        model: "muse-spark-1.3",
        choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 4000,
          completion_tokens: 500,
          prompt_tokens_details: { cached_tokens: 900 },
          completion_tokens_details: { reasoning_tokens: 120 },
        },
      }),
    );
    expect(await call()).toMatchObject({ cachedTokens: 900, reasoningTokens: 120, requests: 1 });
  });
});
