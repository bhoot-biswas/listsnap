import "server-only";
import { z } from "zod";
import { Scene } from "@/lib/schemas/pipeline";
import { executeListingStep, executeLookStep } from "@/server/pipeline/execute";
import { Look } from "@/lib/schemas/looks";
import { executeStoreStep } from "@/server/pipeline/store-step";
import type { StepOutcome } from "@/server/pipeline/run-step";
import { defineOp } from "./define-op";
import { ListingId } from "./listing-ops";

/**
 * Ops over pipeline steps. They run under the step rules (saved result first, atomic
 * claim, at most three attempts), so the step outcome comes back as the op's value and
 * the caller shows it as it always has: done, still running, or failed in the seller's words.
 */

export const renderScene = defineOp({
  name: "renderScene",
  description:
    "Make one AI photo of a listing: 'studio' (the real product on a clean background), 'lifestyle' (an AI scene) or 'banner' (a wide promotional image). Uses one of today's AI photos unless that scene already exists.",
  input: z.object({ listingId: ListingId, scene: Scene }),
  effect: "creates_media",
  cost: () => ({ images: 1 }),
  async run({ workspace }, { listingId, scene }) {
    const r = await executeListingStep(workspace, listingId, "render", { scene });
    if (!r.found) return { ok: false, error: "not_found" };
    if ("invalid" in r) return { ok: false, error: "invalid", message: r.invalid };
    return { ok: true, value: { outcome: r.outcome as StepOutcome<unknown> }, listingId, summary: scene };
  },
});

export const saveDraftToStore = defineOp({
  name: "saveDraftToStore",
  description:
    "Save a finished listing to the shop's WooCommerce store as a draft product (never published). With update, send the latest edits to the same draft. Needs the seller's confirmation.",
  input: z.object({ listingId: ListingId, update: z.boolean().default(false) }),
  effect: "changes_store",
  async run({ workspace }, { listingId, update }) {
    const r = await executeStoreStep(workspace, listingId, { update });
    if (!r.found) return { ok: false, error: "not_found" };
    if ("invalid" in r) return { ok: false, error: "not_ready", message: r.invalid };
    return {
      ok: true,
      value: { outcome: r.outcome as StepOutcome<unknown> },
      listingId,
      summary: update ? "update draft" : "save draft",
    };
  },
});

export const renderLook = defineOp({
  name: "renderLook",
  description:
    "Make one campaign photo of a listing for an occasion: 'eid', 'boishakh' (Pohela Boishakh), 'minimal' (plain white), 'outdoor' or 'wedding'. The product is redrawn in that setting, checked against the real product, and labelled as an AI scene. Uses one of today's AI photos unless that look already exists.",
  input: z.object({ listingId: ListingId, look: Look, retry: z.boolean().default(false) }),
  effect: "creates_media",
  cost: () => ({ images: 1 }),
  async run({ workspace }, { listingId, look, retry }) {
    const r = await executeLookStep(workspace, listingId, look, retry);
    if (!r.found) return { ok: false, error: "not_found" };
    if ("invalid" in r) return { ok: false, error: "not_ready", message: r.invalid };
    return { ok: true, value: { outcome: r.outcome as StepOutcome<unknown> }, listingId, summary: look };
  },
});
