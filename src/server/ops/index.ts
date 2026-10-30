import "server-only";
import { z } from "zod";
import { defineOp, type Op } from "./define-op";
import { editListingFields, getListingSummary, saveListingEdit, undoLast } from "./listing-ops";
import { makeReel, renderLook, renderScene, saveDraftToStore } from "./pipeline-ops";
import { setBrandKit } from "./brand-ops";

export type { Effect, Op, OpError, OpMeta, OpResult } from "./define-op";

/**
 * Every operation, by name. Server Actions and Route Handlers call these today; the
 * chat will expose the same registry as its tools, so a new capability is added here
 * once and both get it.
 */
const base = {
  getListingSummary,
  saveListingEdit,
  editListingFields,
  undoLast,
  renderScene,
  renderLook,
  makeReel,
  saveDraftToStore,
  setBrandKit,
};

export const estimateCost = defineOp({
  name: "estimateCost",
  description:
    "Before running an op that makes AI photos, check how many of today's AI photos it would use and how many are left.",
  input: z.object({ op: z.string().max(64), input: z.unknown() }),
  effect: "read",
  async run({ workspace, ws }, req) {
    const op = (base as Record<string, Op>)[req.op];
    if (!op) return { ok: false, error: "not_found", message: `There is no op called ${req.op}.` };
    const parsed = op.input.safeParse(req.input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const cost = op.cost!(parsed.data);
    const used = await ws.usageToday();
    return {
      ok: true,
      value: { images: cost.images, imagesLeftToday: Math.max(0, workspace.limits.images - used.images) },
    };
  },
});

export const ops = { ...base, estimateCost };

export type OpName = keyof typeof ops;

export const opList = (): Op[] => Object.values(ops) as Op[];
