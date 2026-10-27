import "server-only";
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { env } from "@/server/env";
import { MAX_SIDE } from "@/server/media/store";
import { StepError } from "@/server/pipeline/run-step";
import type { SegmentInstance } from "../types";
import { BASE_URL, BUSY, photoDataUrl } from "./spark";

/**
 * SAM 3.1 concept segmentation through POST /v1/responses, streamed. The answer is
 * special-token text rather than JSON, so it goes through Meta's own parser
 * (@meta-sam/parser) instead of a hand-written decoder. Measured at 4.5–6 s per photo.
 */

export const SAM_MODEL = "sam-3.1";
export const SAM_COST_USD = 0.0025;
const TIMEOUT_MS = 30_000;

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

/** Every object SAM finds for the phrase, with its box, score and mask raster. */
export async function samSegment(photo: Buffer, phrase: string): Promise<SegmentInstance[]> {
  const key = env().modelApiKey;
  if (!key) throw new Error("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  // SAM answers in the pixel space of the image it was sent, so send the photo at its stored size
  const image = await photoDataUrl(photo, MAX_SIDE);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model: SAM_MODEL,
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: phrase },
              { type: "input_image", image_url: image },
            ],
          },
        ],
        metadata: { include_confidence: "true" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[sam] request failed:", err instanceof Error ? err.message : err);
    throw new StepError(BUSY);
  }
  if (res.status === 429 || res.status >= 500) throw new StepError(BUSY);
  if (!res.ok || !res.body) throw new Error(`SAM HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);

  const parsed = parseImageStream(sseEvents(res.body));
  // only the final result matters here; snapshots could feed a live outline later
  for await (const snapshot of parsed) void snapshot;
  const result = await parsed.finalResult;
  if (result.outcome.status !== "completed") {
    console.warn("[sam] incomplete answer:", result.outcome);
    throw new StepError(BUSY);
  }

  const boxes = recordsOfKind(result.records, "box");
  return recordsOfKind(result.records, "mask").map((m) => {
    const box = boxes.find((b) => b.objectId === m.objectId);
    const { left, top, right, bottom } = m.bounds;
    return {
      box: { x: left, y: top, w: right - left, h: bottom - top },
      score: m.confidence ?? box?.confidence ?? null,
      mask: { raster: decodeMaskToRaster(m.mask), width: m.mask.width, height: m.mask.height },
    };
  });
}
