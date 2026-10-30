import "server-only";
import { z } from "zod";
import { BanglaText, ListingText, PlanResult, ProductMatch } from "@/lib/schemas/pipeline";
import { logged } from "../log";
import type { MetaProvider } from "../types";
import { paletteSwatch } from "@/server/image-ops";
import {
  backgroundPrompt,
  brandKitPrompt,
  editImage,
  endUser,
  generateImage,
  IMAGE_COST_USD,
  IMAGE_MODEL,
  type ImageResult,
  lifestylePrompt,
} from "./image";
import { SAM_COST_USD, SAM_MODEL, SamRejectedError, samSegment } from "./sam";
import { liveAssist } from "./assist";
import { BANGLA_SYSTEM, MATCH_SYSTEM, SELLER_CONTEXT, writeSystem } from "./prompts";
import { photoDataUrl, SPARK_EFFORT, SPARK_MODEL, sparkJson, type SparkResult } from "./spark";

/**
 * The live Meta provider: Muse Spark plans, writes, translates and groups; SAM 3.1
 * finds and masks the products; Muse Image makes empty backgrounds and lifestyle edits.
 */

const PLAN_SYSTEM =
  SELLER_CONTEXT +
  " Your first job is to decide what a segmentation model should look for. SAM 3.1 takes a short noun phrase " +
  "(like 'jamdani saree' or 'gold bangle') and returns every matching object, so choose the phrase that matches " +
  "the sellable product and nothing else on the table. Then brief the photographer: where this product would " +
  "look its best for a Bangladeshi buyer, which colours flatter it, and what must stay out of the picture so " +
  "nobody thinks it comes with the product.";

const GROUP_SYSTEM =
  SELLER_CONTEXT +
  " A segmentation model found several items in one seller photo. You see each item's cutout, in order. Decide how " +
  "the seller most likely sells them: 'separate' when they are different products (different designs or kinds), " +
  "'set' when they are sold together as one bundle, 'variants' when they are the same design in different colours. " +
  "Give one short, plain colour name per item in the same order (e.g. 'Maroon', 'Mustard', 'Navy'), and one short " +
  "sentence of reason addressed to the seller.";

const GroupSuggestion = z.object({
  mode: z.enum(["separate", "set", "variants"]),
  colors: z.array(z.string()).describe("One short colour name per item, in item order"),
  reason: z.string().describe("One short sentence for the seller"),
});

const info = { provider: "meta", model: SPARK_MODEL, endpoint: "chat/completions", mode: "live" } as const;
// appended to every Spark summary: a retry, and how much of the prompt came from the cache
const retried = (r: SparkResult<unknown>) =>
  (r.requests > 1 ? " · retried unreadable answer" : "") + (r.cachedTokens ? ` · cached ${r.cachedTokens}` : "");
const tokens = (r: ImageResult) => (r.tokens ? ` · ${r.tokens} tokens` : "");

export const liveMeta: MetaProvider = {
  mode: "live",

  plan: async (ctx, photo) => {
    const imageUrl = await photoDataUrl(photo);
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "PlanResult",
          effort: SPARK_EFFORT.plan,
          schema: PlanResult,
          system: PLAN_SYSTEM,
          userText: "Look at this seller's photo and fill in the plan.",
          imageUrl,
        }),
      (r) => ({
        summary: `phrase "${r.data.sam_phrase}" · ${r.data.multi_kind} · ${r.data.camera_angle}${retried(r)}`,
        costUsd: r.costUsd,
      }),
    );
    return r.data;
  },

  write: async (ctx, photo, plan, voice) => {
    const imageUrl = await photoDataUrl(photo);
    const firstLook = JSON.stringify({ product: plan.sam_phrase, category: plan.category_guess });
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "Listing",
          effort: SPARK_EFFORT.write,
          schema: ListingText,
          system: writeSystem(voice),
          userText: `Write the listing for the product in this photo. A first look found: ${firstLook}.`,
          imageUrl,
        }),
      (r) => ({ summary: `"${r.data.title}" · confidence ${r.data.confidence}${retried(r)}`, costUsd: r.costUsd }),
    );
    return r.data;
  },

  translate: async (ctx, listing) => {
    const { title, short_description, description, attributes, tags } = listing;
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "BanglaListing",
          effort: SPARK_EFFORT.translate,
          schema: BanglaText,
          system: BANGLA_SYSTEM,
          userText: `Listing to localize:\n${JSON.stringify({ title, short_description, description, attributes, tags }, null, 2)}`,
        }),
      (r) => ({ summary: `"${r.data.title}"${retried(r)}`, costUsd: r.costUsd }),
    );
    return r.data;
  },

  assist: liveAssist,

  group: async (ctx, crops, plan) => {
    const images = await Promise.all(crops.map((c) => photoDataUrl(c, 384)));
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "GroupSuggestion",
          effort: SPARK_EFFORT.group,
          schema: GroupSuggestion,
          system: GROUP_SYSTEM,
          userText: `The photo was planned as: ${JSON.stringify({ product: plan.sam_phrase, kind: plan.multi_kind })}. There are ${crops.length} items, in this order.`,
          imageUrl: images,
        }),
      (r) => ({ summary: `suggest ${r.data.mode} · ${r.data.colors.join(", ")}${retried(r)}`, costUsd: r.costUsd }),
    );
    // a short or long colour list would misalign colours and items, so pad or cut it
    const colors = crops.map((_, i) => r.data.colors[i]?.trim() ?? "");
    return { mode: r.data.mode, colors, reason: r.data.reason };
  },

  compareProduct: async (ctx, reference, candidate, phrase) => {
    const images = await Promise.all([photoDataUrl(reference, 1024), photoDataUrl(candidate, 1024)]);
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "ProductMatch",
          effort: SPARK_EFFORT.compare,
          schema: ProductMatch,
          system: MATCH_SYSTEM,
          userText: `The product is a ${phrase}. Image 1 is the product, image 2 is the AI photo.`,
          imageUrl: images,
        }),
      (r) => ({
        summary: `same product: ${r.data.same ? "yes" : `no · ${r.data.differences}`}${retried(r)}`,
        costUsd: r.costUsd,
      }),
    );
    return r.data;
  },

  segment: async (ctx, photo, phrase) => {
    try {
      const r = await logged(
        ctx,
        { provider: "meta", model: SAM_MODEL, endpoint: "responses", mode: "live" },
        () => samSegment(photo, phrase),
        (r) => ({
          summary: `"${phrase}" → ${r.instances.length} instance(s)${r.diagnostics ? ` · ${r.diagnostics} skipped line(s)` : ""}`,
          costUsd: SAM_COST_USD,
        }),
      );
      return r.instances;
    } catch (err) {
      // already logged as a failed call; a refused phrase counts as "nothing found" so the
      // next phrase (or the whole-photo fallback) runs instead of three doomed attempts
      if (err instanceof SamRejectedError) return [];
      throw err;
    }
  },

  background: async (ctx, scene, angle, brief) => {
    const { prompt, size } = backgroundPrompt(scene, angle, brief);
    const r = await logged(
      ctx,
      { provider: "meta", model: IMAGE_MODEL, endpoint: "images/generations", mode: "live" },
      () => generateImage(prompt, size, endUser(ctx.workspaceId)),
      (r) => ({ summary: `${scene} background (${angle})${tokens(r)}`, costUsd: IMAGE_COST_USD }),
    );
    return r.image;
  },

  editScene: async (ctx, main, scene, phrase, brief, kit) => {
    const cutout = await photoDataUrl(main, 1024);
    // in the seller's shop: original, cutout, shop, then the swatch, as brandKitPrompt names them
    const images = kit
      ? [
          await photoDataUrl(kit.original, 1024),
          cutout,
          await photoDataUrl(kit.setting, 1024),
          ...(kit.colors.length ? [await photoDataUrl(await paletteSwatch(kit.colors), 600)] : []),
        ]
      : cutout;
    const prompt = kit ? brandKitPrompt(phrase, brief, kit.colors.length > 0) : lifestylePrompt(phrase, brief);
    const r = await logged(
      ctx,
      { provider: "meta", model: IMAGE_MODEL, endpoint: "images/edits", mode: "live" },
      () => editImage(images, prompt, endUser(ctx.workspaceId)),
      (r) => ({
        summary: `${scene} scene ${kit ? "in the shop setting" : "from the cutout"}${brief ? " · brief" : ""}${tokens(r)}`,
        costUsd: IMAGE_COST_USD,
      }),
    );
    return r.image;
  },
};
