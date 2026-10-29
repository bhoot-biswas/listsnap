import "server-only";
import { searchPhrases } from "./phrase-search";
import { StepError } from "./run-step";
import { crop, dimensions, MAIN_SIZE, photoCheck, whiteMain, type Box } from "@/server/image-ops";
import { maskCutout } from "@/server/image-ops/cutout";
import { readMedia, saveMedia } from "@/server/media/store";
import { meta } from "@/server/providers";
import type { SegmentInstance } from "@/server/providers/types";
import type { WorkspaceScope } from "@/server/db/scope";
import type { GroupResult, PlanResult, SegmentResult } from "@/lib/schemas/pipeline";

/**
 * Job-level steps: plan → segment → group. Each reads what earlier steps saved, does
 * its work and returns a result to be saved; none of them knows about HTTP.
 */

export interface JobStepContext {
  ws: WorkspaceScope;
  jobId: string;
}

/** Shop-display photos can hold 25–49 items; only the largest are offered. */
export const MAX_ITEMS = 12;
const MIN_SCORE = 0.3;

async function firstPhoto(ctx: JobStepContext) {
  const [photo] = await ctx.ws.photos(ctx.jobId);
  if (!photo) throw new StepError("This job has no photo.");
  const file = await readMedia(ctx.ws.id, photo.media_id);
  if (!file) throw new StepError("The photo file is missing.");
  return { photo, data: file.data };
}

async function requireResult<T>(ctx: JobStepContext, step: string): Promise<T> {
  const r = await ctx.ws.stepResult<T>(ctx.jobId, step);
  if (!r) throw new StepError(`The ${step} step hasn't finished yet.`);
  return r;
}

const call = (ctx: JobStepContext, step: string) => ({ workspaceId: ctx.ws.id, jobId: ctx.jobId, step });

export async function planStep(ctx: JobStepContext): Promise<PlanResult> {
  const { data } = await firstPhoto(ctx);
  const plan = await meta().plan(call(ctx, "plan"), data);
  await ctx.ws.updateJob(ctx.jobId, { cameraAngle: plan.camera_angle });
  return plan;
}

/**
 * SAM with the planned phrase, then Spark's alternatives together (the agentic retry). If none
 * finds anything, the whole photo becomes the one item, so the seller still gets a
 * listing. Cutouts and the photo check are made here too, in one short request: a
 * transparent PNG from SAM's mask (studio scenes composite it) and the white main image.
 * Multi-angle jobs (several photos of one product) arrive in Phase 5; until then only
 * the first photo is segmented.
 */
export async function segmentStep(ctx: JobStepContext): Promise<SegmentResult> {
  const plan = await requireResult<PlanResult>(ctx, "plan");
  const { photo, data } = await firstPhoto(ctx);
  const phrases = [plan.sam_phrase, ...plan.alt_phrases].filter(Boolean).slice(0, 3);
  const search = await searchPhrases(phrases, async (p) =>
    // a faint match is usually something next to the product, not the product
    (await meta().segment(call(ctx, "segment"), data, p)).filter((f) => f.score === null || f.score >= MIN_SCORE),
  );
  const { tried } = search;
  const phrase = search.phrase ?? plan.sam_phrase;
  let found: SegmentInstance[] = search.found;
  if (!found.length) found = [{ box: { x: 0, y: 0, w: photo.width, h: photo.height }, score: null }];
  found = found.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, MAX_ITEMS);
  // back in reading order after keeping the largest
  found.sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);

  const saved: { box: Box; score: number | null; cutoutMediaId: string; cutoutPngMediaId: string | null }[] = [];
  for (const inst of found) {
    // SAM's mask gives a transparent cutout; without one (mock, or no match) the box is cropped
    const png = inst.mask ? await maskCutout(data, inst.box, inst.mask) : null;
    const pngMedia = png
      ? await saveMedia(ctx.ws.id, "cutout", png, { mime: "image/png", ...(await dimensions(png)) })
      : null;
    const main = await whiteMain(png ?? (await crop(data, inst.box)).data);
    const media = await saveMedia(ctx.ws.id, "main", main, { mime: "image/jpeg", width: MAIN_SIZE, height: MAIN_SIZE });
    saved.push({ box: inst.box, score: inst.score, cutoutMediaId: media.id, cutoutPngMediaId: pngMedia?.id ?? null });
  }
  const itemIds = await ctx.ws.replaceItems(photo.id, saved);
  const check = await photoCheck(
    data,
    saved.map((s) => s.box),
  );
  await ctx.ws.setPhotoCheck(photo.id, check);

  return {
    phrase,
    tried,
    instances: saved.map((s, i) => ({
      itemId: itemIds[i]!,
      box: s.box,
      score: s.score,
      cutoutMediaId: s.cutoutMediaId,
    })),
    check,
  };
}

/**
 * One item, a pair, or identical copies need no choice and become one listing now.
 * Anything else gets Spark's suggestion and waits for the seller (S6, POST /choice).
 */
export async function groupStep(ctx: JobStepContext): Promise<GroupResult> {
  const plan = await requireResult<PlanResult>(ctx, "plan");
  const items = await ctx.ws.items(ctx.jobId);
  const ids = items.map((i) => i.id);

  if (items.length <= 1 || plan.multi_kind === "pair" || plan.multi_kind === "identical_copies") {
    const mode = items.length <= 1 ? "single" : plan.multi_kind === "pair" ? "pair" : "identical";
    const groups =
      mode === "identical" ? [{ itemIds: [ids[0]!], stockQty: items.length }] : [{ itemIds: ids, stockQty: null }];
    await ctx.ws.createListings(ctx.jobId, groups);
    await ctx.ws.updateJob(ctx.jobId, { groupMode: mode });
    return {
      mode,
      auto: true,
      colors: [],
      reason: mode === "single" ? "One item." : `Treated as ${mode === "pair" ? "a pair" : "identical copies"}.`,
    };
  }

  const crops: Buffer[] = [];
  for (const item of items) {
    const file = item.cutout_media_id ? await readMedia(ctx.ws.id, item.cutout_media_id) : null;
    if (file) crops.push(file.data);
  }
  const suggestion = await meta().group(call(ctx, "group"), crops, plan);
  await ctx.ws.setItemColors(items.map((it, i) => ({ itemId: it.id, color: suggestion.colors[i] ?? "" })));
  await ctx.ws.updateJob(ctx.jobId, { groupMode: suggestion.mode, status: "awaiting_choice" });
  return { mode: suggestion.mode, auto: false, colors: suggestion.colors, reason: suggestion.reason };
}
