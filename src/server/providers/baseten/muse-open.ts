import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { PermanentError, StepError } from "@/server/pipeline/run-step";
import { guard, noteRateLimit, record } from "../breaker";
import { BUSY, strictSchema, UNREADABLE } from "../meta/spark";

/**
 * Muse Spark Open, Meta's open-weights Muse Spark, through Baseten's OpenAI-compatible
 * Chat Completions. Unlike Muse Spark on the Meta API it has no structured outputs, so
 * the answer is asked for as JSON in the prompt and checked with the same Zod schema;
 * the spike found that reads better than a forced tool call, which skips reasoning
 * altogether. It always reasons; `low` was enough for every voice note tried.
 */

const URL = "https://inference.baseten.co/v1/chat/completions";
/** The hackathon key works with this model name only, not Baseten's docs' `muse-spark-open`. */
export const OPEN_MODEL = "meta-models/muse-spark-open-1026";
const PRICE_PER_M = { input: 1.25, output: 4.25 };
/** The listen step holds a 45 s lock; transcription has already used up to 20 s of it. */
const BUDGET_MS = 22_000;
const RETRY_MIN_MS = 9_000;

const Completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z.array(z.object({ function: z.object({ arguments: z.string() }) })).nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

export interface OpenResult<T> {
  data: T;
  costUsd: number;
  requests: number;
}

type Part = { type: "text"; text: string } | { type: "image_url" | "audio_url"; [k: string]: unknown };

/**
 * One answer checked against `schema`. With `tool` set the answer comes as that tool's
 * arguments (needed with audio, where the JSON-in-text answer wandered in the spike);
 * otherwise as JSON in the text. An unreadable answer is asked for once more.
 */
export async function openJson<S extends z.ZodType>(opts: {
  name: string;
  schema: S;
  system: string;
  content: Part[];
  tool?: boolean;
}): Promise<OpenResult<z.infer<S>>> {
  const key = env().basetenApiKey;
  if (!key) throw new PermanentError("PROVIDER_MODE_BASETEN=live needs BASETEN_API_KEY.");
  const schema = strictSchema(opts.schema);
  const body = JSON.stringify({
    model: OPEN_MODEL,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: opts.tool
          ? opts.system
          : `${opts.system} Answer with only a JSON object, no other text, matching this JSON schema: ${JSON.stringify(schema)}`,
      },
      { role: "user", content: opts.content },
    ],
    ...(opts.tool && {
      tools: [{ type: "function", function: { name: opts.name, description: "Save the answer", parameters: schema } }],
      tool_choice: { type: "function", function: { name: opts.name } },
    }),
  });

  const deadline = performance.now() + BUDGET_MS;
  let costUsd = 0;
  for (let requests = 1; ; requests++) {
    const completion = await post(key, body, deadline - performance.now());
    if (completion.usage)
      costUsd +=
        (completion.usage.prompt_tokens * PRICE_PER_M.input + completion.usage.completion_tokens * PRICE_PER_M.output) /
        1e6;
    const message = completion.choices[0]!.message;
    const text = opts.tool ? message.tool_calls?.[0]?.function.arguments : message.content;
    const parsed = opts.schema.safeParse(readJson(text));
    if (parsed.success) return { data: parsed.data, costUsd: Math.round(costUsd * 1e6) / 1e6, requests };
    console.warn(`[muse-open] ${opts.name}: unreadable answer (request ${requests})`);
    if (requests >= 2 || deadline - performance.now() < RETRY_MIN_MS) throw new StepError(UNREADABLE);
  }
}

/** The JSON object in an answer, even when the model wraps it in a code fence. */
function readJson(text: string | null | undefined): unknown {
  const match = text?.match(/\{[\s\S]*\}/);
  try {
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

async function post(key: string, body: string, timeoutMs: number): Promise<z.infer<typeof Completion>> {
  guard("open", BUSY);
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
  } catch (err) {
    console.warn("[muse-open] request failed:", err instanceof Error ? err.message : err);
    record("open", false);
    throw new StepError(BUSY);
  }
  noteRateLimit("open", res.headers);
  // 529 is Baseten's "overloaded"
  if (res.status === 429 || res.status >= 500) {
    console.warn(`[muse-open] HTTP ${res.status}`);
    record("open", false);
    throw new StepError(BUSY);
  }
  record("open", true);
  if (!res.ok) throw new PermanentError(`Muse Spark Open HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const parsed = Completion.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error("Muse Spark Open sent an unexpected response");
  return parsed.data;
}
