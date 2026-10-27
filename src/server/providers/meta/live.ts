import "server-only";
import { ListingText, PlanResult } from "@/lib/schemas/pipeline";
import { logged } from "../log";
import type { MetaProvider } from "../types";
import { mockMeta } from "./mock";
import { photoDataUrl, SPARK_MODEL, sparkJson, type SparkResult } from "./spark";

/**
 * The live Meta provider. plan and write call Muse Spark; segment, group, translate and
 * the image calls stay on the mock until their phases (3, 4 and 5), so the whole
 * pipeline still runs end to end. Those calls keep logging as "mock", which the Under
 * the hood panel shows, so fake output is never passed off as real.
 */

// Prompts tuned during the Phase 0a spike runs; see the field descriptions in the schemas too.
const SELLER_CONTEXT =
  "You help small social-commerce sellers in Bangladesh list products on their WooCommerce store. " +
  "Be accurate: describe only what the photo shows or what is very likely, and never invent brand names, " +
  "measurements or materials you cannot see.";

const PLAN_SYSTEM =
  SELLER_CONTEXT +
  " Your first job is to decide what a segmentation model should look for. SAM 3.1 takes a short noun phrase " +
  "(like 'jamdani saree' or 'gold bangle') and returns every matching object, so choose the phrase that matches " +
  "the sellable product and nothing else on the table.";

const writeSystem = (brandVoice: string) =>
  SELLER_CONTEXT +
  ` Write a store listing in clear, ${brandVoice.trim().toLowerCase() || "friendly"} English. Prices are in BDT (৳) ` +
  "for Bangladesh social-commerce buyers. The title, descriptions and tags are read by BUYERS: write them as the " +
  "shop speaking to a customer, never as notes to the seller (no 'please confirm', 'not confirmed from photo', " +
  "'check if'). When something is uncertain, leave it out of the buyer text or describe it neutrally ('see photos " +
  "for detail'), lower the confidence, and put the exact thing to verify in check_notes, which only the seller sees.";

const info = { provider: "meta", model: SPARK_MODEL, endpoint: "chat/completions", mode: "live" } as const;
const retried = (r: SparkResult<unknown>) => (r.requests > 1 ? " · retried unreadable answer" : "");

export const liveMeta: MetaProvider = {
  ...mockMeta,
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

  write: async (ctx, photo, plan, brandVoice) => {
    const imageUrl = await photoDataUrl(photo);
    const firstLook = JSON.stringify({ product: plan.sam_phrase, category: plan.category_guess });
    const r = await logged(
      ctx,
      info,
      () =>
        sparkJson({
          name: "Listing",
          schema: ListingText,
          system: writeSystem(brandVoice),
          userText: `Write the listing for the product in this photo. A first look found: ${firstLook}.`,
          imageUrl,
        }),
      (r) => ({ summary: `"${r.data.title}" · confidence ${r.data.confidence}${retried(r)}`, costUsd: r.costUsd }),
    );
    return r.data;
  },
};
