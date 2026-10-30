import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/server/env";
import { PermanentError, StepError } from "@/server/pipeline/run-step";
import { guard, noteRateLimit, record } from "../breaker";

/**
 * Muse Spark through Chat Completions with strict structured output, the shape the
 * Phase 0a spike proved. The JSON schema is made from the same Zod schema that checks
 * the answer, so the two can't drift apart.
 */

export const BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";
const PRICE_PER_M = { input: 1.25, output: 4.25 };

/**
 * Plan and write run under a 45 s step lock (execute.ts). Every request has to end
 * before it expires, or a second claim could run the same step in parallel.
 */
const BUDGET_MS = 40_000;
/** A retry after an unreadable answer only starts if a typical call (p90 ~15 s) still fits. */
const RETRY_MIN_MS = 16_000;
/**
 * Image tokens dominate the cost and scale with size: a photo is 3,535 input tokens at
 * 1600 px and 2,287 at 1280, the size the cookbook's perception recipe uses. Plans and
 * listings written from 1280 px photos read as well in the effort spike.
 */
const PHOTO_PX = 1280;

export const BUSY = "The AI service is busy right now. Try again in a minute; your photo is saved.";
export const UNREADABLE = "The AI gave an answer we couldn't read. Try again.";

const Completion = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullish() }))
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
      completion_tokens_details: z.object({ reasoning_tokens: z.number().nullish() }).nullish(),
    })
    .nullish(),
});

/**
 * How much Spark thinks before answering. The API's default is "still being finalized"
 * (cookbook, reasoning recipe), so every call names its own; `high` is the effective top.
 */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

/**
 * Each Spark call's effort, as the effort spike kept them: plan and write gave equally
 * good answers at `medium` and `high`, `medium` faster; translate and group gave the
 * same answers at `minimal`, three times faster than `low`. The fidelity judge was right
 * at both `low` and `minimal` and stays at `low`, as the safety check. Assist was not
 * measured. One table, so a spike can try other levels through the same code.
 */
export const SPARK_EFFORT: Record<"plan" | "write" | "translate" | "group" | "compare" | "assist", ReasoningEffort> = {
  plan: "medium",
  write: "medium",
  translate: "minimal",
  group: "minimal",
  compare: "low",
  assist: "low",
};

export interface SparkResult<T> {
  data: T;
  model: string;
  costUsd: number;
  /** How many requests it took: 2 means the first answer was unreadable. */
  requests: number;
  /** Prompt tokens served from the prompt cache, across the requests. */
  cachedTokens: number;
  /** Thinking tokens, billed as output. */
  reasoningTokens: number;
}

/**
 * Zod emits keywords outside Spark's strict subset (no length or range limits there),
 * so they are dropped; the Zod parse still enforces them on the answer.
 */
export function strictSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (["$schema", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"].includes(k)) continue;
      out[k] = strip(v);
    }
    return out;
  };
  return strip(z.toJSONSchema(schema, { target: "draft-7", io: "output" })) as Record<string, unknown>;
}

/** The photo as a JPEG data URL, no larger than the size the spike measured. */
export async function photoDataUrl(photo: Buffer, maxPx = PHOTO_PX): Promise<string> {
  const jpeg = await sharp(photo)
    .rotate()
    .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function sparkJson<S extends z.ZodType>(opts: {
  name: string;
  schema: S;
  system: string;
  userText: string;
  /** One photo, or several in order (grouping sends one crop per item). */
  imageUrl?: string | string[];
  effort: ReasoningEffort;
}): Promise<SparkResult<z.infer<S>>> {
  const key = env().modelApiKey;
  // not the seller's to fix, so a plain Error: the generic message plus a server log line
  if (!key) throw new PermanentError("PROVIDER_MODE_META=live needs MODEL_API_KEY.");

  const body = JSON.stringify(sparkBody(opts));

  const deadline = performance.now() + BUDGET_MS;
  let costUsd = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  let model = SPARK_MODEL;
  for (let requests = 1; ; requests++) {
    const completion = await sparkPost(key, body, deadline - performance.now(), Completion);
    model = completion.model ?? model;
    const usage = completion.usage;
    if (usage) {
      costUsd += sparkCost(usage);
      cachedTokens += usage.prompt_tokens_details?.cached_tokens ?? 0;
      reasoningTokens += usage.completion_tokens_details?.reasoning_tokens ?? 0;
    }
    const parsed = parseAnswer(opts.schema, completion.choices[0]!.message.content);
    if (parsed.success)
      return { data: parsed.data, model, costUsd: round6(costUsd), requests, cachedTokens, reasoningTokens };
    console.warn(`[spark] ${opts.name}: unreadable answer (request ${requests}): ${parsed.error}`);
    if (requests >= 2 || deadline - performance.now() < RETRY_MIN_MS) throw new StepError(UNREADABLE);
  }
}

/**
 * The request. Instructions go in a `developer` message, which the cookbook prefers over
 * `system` (Spark applies `system` at that level anyway). The cache key names the step's
 * stable prefix, so same-prefix calls land where their prefix is already cached.
 */
export function sparkBody(opts: {
  name: string;
  schema: z.ZodType;
  system: string;
  userText: string;
  imageUrl?: string | string[];
  effort: ReasoningEffort;
}): Record<string, unknown> {
  const content: unknown[] = [{ type: "text", text: opts.userText }];
  for (const url of [opts.imageUrl ?? []].flat()) content.push({ type: "image_url", image_url: { url } });
  return {
    model: SPARK_MODEL,
    messages: [
      { role: "developer", content: opts.system },
      { role: "user", content },
    ],
    reasoning_effort: opts.effort,
    prompt_cache_key: `listsnap-${opts.name}-v1`,
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, strict: true, schema: strictSchema(opts.schema) },
    },
  };
}

function parseAnswer<S extends z.ZodType>(
  schema: S,
  text: string | null,
): { success: true; data: z.infer<S> } | { success: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text ?? "");
  } catch {
    return { success: false, error: "not JSON" };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: z.prettifyError(result.error).slice(0, 300) };
}

/** What a completion's usage cost, in dollars. */
export const sparkCost = (usage: { prompt_tokens: number; completion_tokens: number }) =>
  (usage.prompt_tokens * PRICE_PER_M.input + usage.completion_tokens * PRICE_PER_M.output) / 1e6;

/**
 * One Chat Completions request with the shared rules: the circuit breaker, a timeout, and
 * which failures are worth retrying. The caller's schema checks the response's shape.
 */
export async function sparkPost<S extends z.ZodType>(
  key: string,
  body: string,
  timeoutMs: number,
  schema: S,
): Promise<z.infer<S>> {
  guard("spark", BUSY);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
  } catch (err) {
    // timeouts and network drops are worth another attempt by the step runner
    console.warn("[spark] request failed:", err instanceof Error ? err.message : err);
    record("spark", false);
    throw new StepError(BUSY);
  }
  noteRateLimit("spark", res.headers);
  if (res.status === 429 || res.status >= 500) {
    console.warn(`[spark] HTTP ${res.status}`);
    record("spark", false);
    throw new StepError(BUSY);
  }
  record("spark", true);
  if (!res.ok) {
    // 400/401/403/404 are our mistakes (schema, key, model access): keep the details server-side,
    // and don't retry, since the same request fails the same way
    const text = (await res.text()).slice(0, 500);
    throw new PermanentError(`Muse Spark HTTP ${res.status}: ${text}`);
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Muse Spark sent an unexpected response: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
