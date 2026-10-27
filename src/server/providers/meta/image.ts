import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";
import type { PlanResult, Scene } from "@/lib/schemas/pipeline";
import { BASE_URL, BUSY } from "./spark";

/**
 * Muse Image. Studio and banner scenes only ask it for an empty background: the real
 * cutout goes on top afterwards, so the product's colours and pattern are never
 * redrawn. The background has to be seen from the same angle as the photo (a flat lay
 * from above, a studio sweep from the side), or the composite looks pasted on.
 * Lifestyle edits the white main image instead, and is labelled "AI scene".
 */

export const IMAGE_MODEL = "muse-image-1.0";
export const IMAGE_COST_USD = 0.01;
/** Measured 10–34 s; render steps hold a 90 s lock, so this must end well before it. */
const TIMEOUT_MS = 75_000;

const NO_TEXT = "nothing on it, no objects, no people, no text, no logos.";

const BACKGROUNDS = {
  flatlay: `Top-down flat lay photograph of an empty smooth light-grey linen surface seen from directly above, soft even daylight, very subtle texture, ${NO_TEXT}`,
  studio: `Empty seamless studio backdrop for product photography, soft light-grey paper sweep, gentle even lighting, subtle floor shadow area, ${NO_TEXT}`,
  banner: `Wide clean promotional banner background, soft warm gradient with subtle light rays, large empty space, ${NO_TEXT}`,
} as const;

export function backgroundPrompt(scene: Scene, angle: PlanResult["camera_angle"]): { prompt: string; size: string } {
  if (scene === "banner") return { prompt: BACKGROUNDS.banner, size: "1536x768" };
  return { prompt: angle === "top_down" ? BACKGROUNDS.flatlay : BACKGROUNDS.studio, size: "1024x1024" };
}

export const lifestylePrompt = (product: string) =>
  `Lifestyle product photo of this ${product} placed on a warm wooden table near a window with soft daylight, ` +
  "simple tasteful Bangladeshi home setting, shallow depth of field. Keep the product exactly as it is: same shape, " +
  "colors, pattern and details. No people, no text.";

const ImagesResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().nullish(), url: z.string().nullish() })).min(1),
});

async function imagesCall(path: "images/generations" | "images/edits", body: Record<string, unknown>): Promise<Buffer> {
  const key = env().modelApiKey;
  if (!key) throw new Error("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, n: 1, output_format: "png", ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[muse-image] request failed:", err instanceof Error ? err.message : err);
    throw new StepError(BUSY);
  }
  if (res.status === 429 || res.status >= 500) throw new StepError(BUSY);
  if (!res.ok) throw new Error(`Muse Image HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const parsed = ImagesResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Muse Image sent an unexpected response: ${parsed.error.message.slice(0, 300)}`);
  const item = parsed.data.data[0]!;
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url)
    return Buffer.from(await (await fetch(item.url, { signal: AbortSignal.timeout(20_000) })).arrayBuffer());
  throw new Error("Muse Image returned no image.");
}

export const generateImage = (prompt: string, size: string) => imagesCall("images/generations", { prompt, size });

export const editImage = (imageDataUrl: string, prompt: string) =>
  imagesCall("images/edits", { prompt, images: [{ image_url: imageDataUrl }], size: "1024x1024" });
