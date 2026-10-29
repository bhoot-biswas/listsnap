import "server-only";
import { z } from "zod";
import { BanglaText, ListingText, PlanResult } from "@/lib/schemas/pipeline";
import { logged } from "../log";
import type { MetaProvider } from "../types";
import {
  backgroundPrompt,
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
import { BANGLA_SYSTEM, SELLER_CONTEXT, writeSystem } from "./prompts";
import { photoDataUrl, SPARK_MODEL, sparkJson, type SparkResult } from "./spark";

/**
 * The live Meta provider: Muse Spark plans, writes, translates and groups; SAM 3.1
 * finds and masks the products; Muse Image makes empty backgrounds and lifestyle edits.
 */

const PLAN_SYSTEM =
  SELLER_CONTEXT +
  " Your first job is to decide what a segmentation model should look for. SAM 3.1 takes a short noun phrase " +
  "(like 'jamdani saree' or 'gold bangle') and returns every matching object, so choose the phrase that matches " +
  "the sellable product and nothing else on the table.";

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
const retried = (r: SparkResult<unknown>) => (r.requests > 1 ? " · retried unreadable answer" : "");
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

  background: async (ctx, scene, angle) => {
    const { prompt, size } = backgroundPrompt(scene, angle);
    const r = await logged(
      ctx,
      { provider: "meta", model: IMAGE_MODEL, endpoint: "images/generations", mode: "live" },
      () => generateImage(prompt, size, endUser(ctx.workspaceId)),
      (r) => ({ summary: `${scene} background (${angle})${tokens(r)}`, costUsd: IMAGE_COST_USD }),
    );
    return r.image;
  },

  editScene: async (ctx, main, scene, phrase) => {
    const image = await photoDataUrl(main, 1024);
    const r = await logged(
      ctx,
      { provider: "meta", model: IMAGE_MODEL, endpoint: "images/edits", mode: "live" },
      () => editImage(image, lifestylePrompt(phrase), endUser(ctx.workspaceId)),
      (r) => ({ summary: `${scene} scene from the cutout${tokens(r)}`, costUsd: IMAGE_COST_USD }),
    );
    return r.image;
  },
};
