import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { StepError } from "@/server/pipeline/run-step";
import type { PlanResult, Scene, SceneBrief } from "@/lib/schemas/pipeline";
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
/** Measured 8–34 s; render steps hold a 90 s lock, so this must end well before it. */
const TIMEOUT_MS = 75_000;

export const BLOCKED = "This photo couldn't be turned into an AI photo. Try a different photo; your listing is saved.";

/**
 * Its built-in web and image search could pull other sellers' pictures of "jamdani saree"
 * and drift away from this one, and an empty backdrop needs no lookups either.
 */
const TOOLS_OFF = { enable_image_search: false, enable_web_search: false, enable_shell: false };

/**
 * Meta asks for a stable end-user id to fight abuse. A hash of the workspace id is stable
 * without telling Meta who the seller is.
 */
export const endUser = (workspaceId: string) =>
  createHash("sha256").update(`listsnap:${workspaceId}`).digest("hex").slice(0, 32);

/** `low` is one render pass: in the spike it drew empty backdrops as well as `high`, in half the time. */
export type ReasoningStrength = "low" | "high";

export interface ImageResult {
  image: Buffer;
  tokens: number | null;
}

const NO_TEXT = "nothing on it, no objects, no people, no text, no logos.";

const BACKGROUNDS = {
  flatlay: `Top-down flat lay photograph of an empty smooth light-grey linen surface seen from directly above, soft even daylight, very subtle texture, ${NO_TEXT}`,
  studio: `Empty seamless studio backdrop for product photography, soft light-grey paper sweep, gentle even lighting, subtle floor shadow area, ${NO_TEXT}`,
} as const;

/**
 * The brief is model output going into another model's prompt: one line each, short,
 * and only a few items, so a long or odd answer can't take the prompt over.
 */
const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const list = (items: string[], n: number, max: number) =>
  items
    .map((i) => clean(i, max))
    .filter(Boolean)
    .slice(0, n);

/**
 * Studio stays a plain backdrop whatever the brief says: the real cutout is the point of
 * it. The banner takes the brief's colours, since it has no product detail to protect.
 */
export function backgroundPrompt(
  scene: Scene,
  angle: PlanResult["camera_angle"],
  brief: SceneBrief | null = null,
): { prompt: string; size: string } {
  if (scene === "banner") {
    const palette = brief ? list(brief.palette, 3, 30) : [];
    const tones = palette.length ? `soft gradient in ${palette.join(", ")} tones` : "soft warm gradient";
    return {
      prompt: `Wide clean promotional banner background, ${tones} with subtle light rays, large empty space, ${NO_TEXT}`,
      size: "1536x768",
    };
  }
  return { prompt: angle === "top_down" ? BACKGROUNDS.flatlay : BACKGROUNDS.studio, size: "1024x1024" };
}

/**
 * The lifestyle scene. In the spike, a brief without a framing rule put the product small
 * in a busy scene and added props a buyer could think were included, so both rules are
 * written out every time.
 */
export function lifestylePrompt(product: string, brief: SceneBrief | null = null): string {
  const keep =
    "The product is the hero: it fills most of the frame and its details are clearly visible. Keep the product " +
    "exactly as it is: same shape, colors, pattern and details.";
  if (!brief || !clean(brief.setting, 200)) {
    return (
      `Lifestyle product photo of this ${product} placed on a warm wooden table near a window with soft daylight, ` +
      `simple tasteful Bangladeshi home setting, shallow depth of field. ${keep} No people, no text.`
    );
  }
  const palette = list(brief.palette, 3, 30);
  const avoid = list(brief.avoid, 3, 60);
  // the setting continues a sentence, and Spark sometimes writes it as its own ("Folded neatly …")
  const setting = clean(brief.setting, 200).replace(/\.$/, "");
  return (
    `Lifestyle product photo of this ${product}, ${setting.charAt(0).toLowerCase()}${setting.slice(1)}. Soft natural light, ` +
    `shallow depth of field${palette.length ? `, background and props in ${palette.join(", ")} tones` : ""}. ${keep} ` +
    "No people, no text, no props that could be mistaken for part of the product." +
    (avoid.length ? ` Leave out: ${avoid.join(", ")}.` : "")
  );
}

const ImagesResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().nullish(), url: z.string().nullish() })).min(1),
  usage: z.object({ total_tokens: z.number() }).nullish(),
});

const ErrorBody = z.object({ error: z.object({ code: z.string().nullish() }) });

/**
 * One image from a JSON body. Renders store JPEG, so that is what we ask for; `size` only
 * sets the aspect ratio (outputs come back at 1600 px whatever it says).
 */
export function imagesBody(
  body: { prompt: string; size: string; images?: { image_url: string }[] },
  opts: { reasoning: ReasoningStrength; user: string },
): Record<string, unknown> {
  return {
    model: IMAGE_MODEL,
    n: 1,
    output_format: "jpeg",
    reasoning_strength: opts.reasoning,
    tool_enablement: TOOLS_OFF,
    user: opts.user,
    ...body,
  };
}

async function imagesCall(
  path: "images/generations" | "images/edits",
  body: Record<string, unknown>,
): Promise<ImageResult> {
  const key = env().modelApiKey;
  if (!key) throw new Error("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[muse-image] request failed:", err instanceof Error ? err.message : err);
    throw new StepError(BUSY);
  }
  if (res.status === 429 || res.status >= 500) throw new StepError(BUSY);
  if (!res.ok) {
    const text = await res.text();
    const code = ErrorBody.safeParse(safeJson(text)).data?.error.code;
    // a safety block is about the photo, so the seller hears it; it isn't billed either
    if (code === "content_policy_violation") throw new StepError(BLOCKED);
    throw new Error(`Muse Image HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const parsed = ImagesResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Muse Image sent an unexpected response: ${parsed.error.message.slice(0, 300)}`);
  const item = parsed.data.data[0]!;
  const tokens = parsed.data.usage?.total_tokens ?? null;
  if (item.b64_json) return { image: Buffer.from(item.b64_json, "base64"), tokens };
  if (item.url)
    return {
      image: Buffer.from(await (await fetch(item.url, { signal: AbortSignal.timeout(20_000) })).arrayBuffer()),
      tokens,
    };
  throw new Error("Muse Image returned no image.");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const generateImage = (prompt: string, size: string, user: string) =>
  imagesCall("images/generations", imagesBody({ prompt, size }, { reasoning: "low", user }));

export const editImage = (imageDataUrl: string, prompt: string, user: string) =>
  imagesCall(
    "images/edits",
    imagesBody({ prompt, images: [{ image_url: imageDataUrl }], size: "1024x1024" }, { reasoning: "high", user }),
  );
