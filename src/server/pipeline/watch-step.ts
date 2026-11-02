import "server-only";
import { StepError } from "./run-step";
import { sharpnessOf } from "@/server/image-ops";
import { normalisePhoto, readMedia, saveMedia } from "@/server/media/store";
import { openVideo } from "@/server/media/video";
import { SHOP_WORDS } from "@/server/media/voice";
import { baseten, meta, type CallContext } from "@/server/providers";
import { takeListingSlot } from "@/server/limits";
import type { WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import type { ListenResult } from "@/lib/schemas/voice-note";
import type { VideoProduct, WatchResult } from "@/lib/schemas/video";

export interface WatchContext {
  ws: WorkspaceScope;
  workspace: Workspace;
  batchId: string;
  /** Who pressed the button, for a demo shop's per-visitor limit. */
  ip: string;
}

/** Frames tried around the moment the model picked; a hand or a turn can blur any one of them. */
const AROUND = [0, -0.6, 0.6];

const time = (ms: number) => (ms / 1000).toFixed(1);

/**
 * A seller's video into one ordinary job per product, in its bulk batch. Muse Voice
 * Transcribe writes down what they said, turn by turn with times; Muse Spark Open watches
 * the video with those words and lists each product, the moment it is seen best and what
 * was said about it. The sharpest frame around that moment becomes the product's photo,
 * and the job starts with what was said already heard, so write uses it like a voice note.
 * From there the batch runs like any bulk upload.
 */
export async function watchStep(ctx: WatchContext): Promise<WatchResult> {
  const made = await ctx.ws.batchJobIds(ctx.batchId);
  const saved = await ctx.ws.batchProducts(ctx.batchId);
  // a batch from before the products were kept: its jobs must not be made twice
  if (made.length && !saved) return { found: made.length, jobs: made.length, limited: 0 };

  const batch = await ctx.ws.getBatch(ctx.batchId);
  const file = batch?.video_media_id ? await readMedia(ctx.ws.id, batch.video_media_id) : null;
  if (!file) throw new StepError("videoMissing");
  const call = { workspaceId: ctx.ws.id, jobId: null, step: "watch" };

  // the first product's listing slot is taken before the paid models listen and watch,
  // so a shop (or demo visitor) already at today's limit costs nothing more
  let first = saved ? null : await takeListingSlot(ctx.ws, ctx.workspace, ctx.ip);
  if (!saved && !first) throw new StepError("listingsUsedUp", { permanent: true });
  const video = await openVideo(file.data);
  try {
    const seconds = await video.seconds();
    // watching again finds the same: these use up the attempts at once instead of three runs
    if (!seconds) throw new StepError("videoUnreadable", { permanent: true });
    // an attempt that stopped part-way already paid for the watch: carry on from its products
    const products = saved ?? (await watchVideo(video, call));
    if (!saved) await ctx.ws.saveBatchProducts(ctx.batchId, products);

    // photos first, so a failure here leaves no half-made batch behind
    const photos = [];
    for (const p of products) photos.push(await bestFrame(video, p, seconds));

    // products are made into jobs in order, so the ones an earlier attempt made come first
    let skip = made.length;
    let jobs = made.length;
    for (const [i, p] of products.entries()) {
      const photo = photos[i];
      if (!photo) continue;
      if (skip > 0) {
        skip--;
        continue;
      }
      // each product is a listing, so each takes one of today's slots, as a bulk photo does
      const slot = first ?? (await takeListingSlot(ctx.ws, ctx.workspace, ctx.ip));
      first = null;
      if (!slot) break;
      try {
        const media = await saveMedia(ctx.ws.id, "original", photo.data, {
          mime: "image/jpeg",
          width: photo.width,
          height: photo.height,
        });
        await ctx.ws.createJob(
          [{ mediaId: media.id, width: photo.width, height: photo.height }],
          ctx.batchId,
          undefined,
          spoken(p),
        );
      } catch (err) {
        // the job wasn't made, so its slot goes back; the next attempt makes it
        await slot();
        throw err;
      }
      jobs++;
    }
    await ctx.ws.setBatchTotal(ctx.batchId, jobs);
    const usable = photos.filter(Boolean).length;
    return { found: products.length, jobs, limited: usable - jobs };
  } finally {
    // no listing was made from it (nothing found, or a failure): the slot goes back
    if (first) await first();
    await video.done();
  }
}

/** Muse Voice Transcribe hears what was said, then Muse Spark Open lists the products. */
async function watchVideo(video: Awaited<ReturnType<typeof openVideo>>, call: CallContext): Promise<VideoProduct[]> {
  const [sound, small] = await Promise.all([video.sound(), video.small()]);
  const heard = sound ? await meta().transcribe(call, sound, SHOP_WORDS, true) : null;
  const timed = (heard?.turns ?? [])
    .filter((t) => t.text)
    .map((t) => `[${time(t.startMs)}–${time(t.endMs)} s] ${t.text}`)
    .join("\n");
  const products = await baseten().watch(call, small, timed);
  if (!products.length) throw new StepError("noProductsInVideo", { permanent: true });
  return products;
}

/** The sharpest of a few frames around the model's moment, as a product photo; null if none. */
async function bestFrame(video: Awaited<ReturnType<typeof openVideo>>, p: VideoProduct, seconds: number) {
  let best: { data: Buffer; score: number } | null = null;
  for (const offset of AROUND) {
    const at = Math.min(Math.max(0, p.best_frame_s + offset), Math.max(0, seconds - 0.1));
    const frame = await video.frame(at);
    if (!frame) continue;
    const score = await sharpnessOf(frame);
    if (!best || score > best.score) best = { data: frame, score };
  }
  return best ? normalisePhoto(best.data) : null;
}

/** What the seller said about one product, as the listen step would have heard it. */
function spoken(p: VideoProduct): ListenResult {
  const { price_bdt, sizes, colors, stock, material, notes } = p;
  const facts = { price_bdt, sizes, colors, stock, material, notes };
  const nothing = price_bdt === null && stock === null && !material && !sizes.length && !colors.length && !notes.length;
  return { transcript: p.said, heardBy: "video", facts: nothing ? null : facts };
}
