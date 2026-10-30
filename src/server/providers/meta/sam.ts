import "server-only";
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { env } from "@/server/env";
import { MAX_SIDE } from "@/server/media/store";
import { PermanentError, StepError } from "@/server/pipeline/run-step";
import { guard, noteRateLimit, record } from "../breaker";
import type { SegmentInstance } from "../types";
import { BASE_URL, BUSY, photoDataUrl } from "./spark";

/**
 * SAM 3.1 concept segmentation through POST /v1/responses, streamed. The answer is
 * special-token text rather than JSON, so it goes through Meta's own parser
 * (@meta-sam/parser) instead of a hand-written decoder. Measured at 4.5–6 s per photo.
 */

export const SAM_MODEL = "sam-3.1";
export const SAM_COST_USD = 0.0025;
/**
 * The segment step holds a 45 s lock and makes at most two rounds of calls (the planned
 * phrase, then the alternatives together), so each must end well inside half of it.
 */
const TIMEOUT_MS = 18_000;

/**
 * SAM refused this request (a 400): the phrase or the image broke one of its rules. The
 * same request would fail again, so the step moves on rather than spending attempts.
 */
export class SamRejectedError extends Error {
  override name = "SamRejectedError";
}

export interface SamAnswer {
  instances: SegmentInstance[];
  /** Malformed lines the parser skipped; a completed stream can still carry some. */
  diagnostics: number;
}

/** Server-sent events: blank-line separated blocks, data lines joined, [DONE] skipped. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ type: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data || data === "[DONE]") return null;
    try {
      return JSON.parse(data) as { type: string };
    } catch {
      return null;
    }
  };
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const event = parse(buffer.slice(0, sep));
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
      if (event) yield event;
    }
  }
  const last = parse(buffer + decoder.decode());
  if (last) yield last;
}

/** The request body: one noun phrase and the photo, with confidence and compact masks. */
export function samBody(phrase: string, imageUrl: string): Record<string, unknown> {
  return {
    model: SAM_MODEL,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
    // one_bit masks are several times smaller than lossless; the cutout only needs 0/1
    metadata: { include_confidence: "true", mask_encoding: "one_bit" },
  };
}

/** Every object SAM finds for the phrase, with its box, score and mask raster. */
export async function samSegment(photo: Buffer, phrase: string): Promise<SamAnswer> {
  const key = env().modelApiKey;
  if (!key) throw new PermanentError("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  // SAM answers in the pixel space of the image it was sent, so send the photo at its stored size
  const image = await photoDataUrl(photo, MAX_SIDE);

  guard("sam", BUSY);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(samBody(phrase, image)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[sam] request failed:", err instanceof Error ? err.message : err);
    record("sam", false);
    throw new StepError(BUSY);
  }
  noteRateLimit("sam", res.headers);
  if (res.status === 429 || res.status >= 500) {
    record("sam", false);
    throw new StepError(BUSY);
  }
  record("sam", true);
  if (res.status === 400) throw new SamRejectedError(`SAM refused "${phrase}": ${(await res.text()).slice(0, 300)}`);
  if (!res.ok) throw new PermanentError(`SAM HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  if (!res.body) throw new Error("SAM sent no stream.");

  const parsed = parseImageStream(sseEvents(res.body));
  // only the final result matters here; snapshots could feed a live outline later
  for await (const snapshot of parsed) void snapshot;
  const result = await parsed.finalResult;
  if (result.outcome.status !== "completed") {
    console.warn("[sam] incomplete answer:", result.outcome);
    throw new StepError(BUSY);
  }

  if (result.diagnostics.length) console.warn(`[sam] ${result.diagnostics.length} malformed line(s) skipped`);

  const boxes = recordsOfKind(result.records, "box");
  const instances = recordsOfKind(result.records, "mask").map((m) => {
    const box = boxes.find((b) => b.objectId === m.objectId);
    const { left, top, right, bottom } = m.bounds;
    return {
      box: { x: left, y: top, w: right - left, h: bottom - top },
      score: m.confidence ?? box?.confidence ?? null,
      mask: { raster: decodeMaskToRaster(m.mask), width: m.mask.width, height: m.mask.height },
    };
  });
  return { instances, diagnostics: result.diagnostics.length };
}
