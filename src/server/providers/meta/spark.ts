import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";

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
/** The spike measured quality at 1600 px; image tokens dominate the cost. */
const PHOTO_PX = 1600;

export const BUSY = "The AI service is busy right now. Try again in a minute; your photo is saved.";
export const UNREADABLE = "The AI gave an answer we couldn't read. Try again.";

const Completion = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullish() }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

export interface SparkResult<T> {
  data: T;
  model: string;
  costUsd: number;
  /** How many requests it took: 2 means the first answer was unreadable. */
  requests: number;
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
}): Promise<SparkResult<z.infer<S>>> {
  const key = env().modelApiKey;
  // not the seller's to fix, so a plain Error: the generic message plus a server log line
  if (!key) throw new Error("PROVIDER_MODE_META=live needs MODEL_API_KEY.");

  const content: unknown[] = [{ type: "text", text: opts.userText }];
  for (const url of [opts.imageUrl ?? []].flat()) content.push({ type: "image_url", image_url: { url } });
  const body = JSON.stringify({
    model: SPARK_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, strict: true, schema: strictSchema(opts.schema) },
    },
  });

  const deadline = performance.now() + BUDGET_MS;
  let costUsd = 0;
  let model = SPARK_MODEL;
  for (let requests = 1; ; requests++) {
    const completion = await post(key, body, deadline - performance.now());
    model = completion.model ?? model;
    if (completion.usage) {
      costUsd +=
        (completion.usage.prompt_tokens * PRICE_PER_M.input + completion.usage.completion_tokens * PRICE_PER_M.output) /
        1e6;
    }
    const parsed = parseAnswer(opts.schema, completion.choices[0]!.message.content);
    if (parsed.success) return { data: parsed.data, model, costUsd: round6(costUsd), requests };
    console.warn(`[spark] ${opts.name}: unreadable answer (request ${requests}): ${parsed.error}`);
    if (requests >= 2 || deadline - performance.now() < RETRY_MIN_MS) throw new StepError(UNREADABLE);
  }
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

async function post(key: string, body: string, timeoutMs: number): Promise<z.infer<typeof Completion>> {
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
    throw new StepError(BUSY);
  }
  if (res.status === 429 || res.status >= 500) {
    console.warn(`[spark] HTTP ${res.status}`);
    throw new StepError(BUSY);
  }
  if (!res.ok) {
    // 400/401/403/404 are our mistakes (schema, key, model access): keep the details server-side
    const text = (await res.text()).slice(0, 500);
    throw new Error(`Muse Spark HTTP ${res.status}: ${text}`);
  }
  const parsed = Completion.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Muse Spark sent an unexpected response: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
