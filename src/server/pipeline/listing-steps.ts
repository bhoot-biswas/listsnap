import "server-only";
import { StepError } from "./run-step";
import { compositeOnBackground, dimensions } from "@/server/image-ops";
import { readMedia, saveMedia } from "@/server/media/store";
import { meta } from "@/server/providers";
import type { ListingRow, WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import {
  ListingText,
  REVIEW_THRESHOLD,
  type BanglaText,
  type PlanResult,
  type RenderResult,
  type Scene,
} from "@/lib/schemas/pipeline";

/** Per-listing steps: write (English), translate (Bangla), render (one scene per call). */

export interface ListingStepContext {
  ws: WorkspaceScope;
  workspace: Workspace;
  listing: ListingRow;
}

const call = (ctx: ListingStepContext, step: string) => ({ workspaceId: ctx.ws.id, jobId: ctx.listing.job_id, step });

async function plan(ctx: ListingStepContext): Promise<PlanResult> {
  const p = await ctx.ws.stepResult<PlanResult>(ctx.listing.job_id, "plan");
  if (!p) throw new StepError("The plan step hasn't finished yet.");
  return p;
}

async function originalPhoto(ctx: ListingStepContext): Promise<Buffer> {
  const [photo] = await ctx.ws.photos(ctx.listing.job_id);
  const file = photo ? await readMedia(ctx.ws.id, photo.media_id) : null;
  if (!file) throw new StepError("The photo file is missing.");
  return file.data;
}

/**
 * The listing's first item, as renders need it: `main` is the white 1:1 image (what the
 * lifestyle edit starts from); `product` is the transparent cutout when SAM made one,
 * so composites place the product itself rather than a white square.
 */
async function itemImages(ctx: ListingStepContext): Promise<{ main: Buffer; product: Buffer }> {
  const items = await ctx.ws.items(ctx.listing.job_id);
  const first = items.find((i) => i.id === ctx.listing.item_ids_json[0]);
  const main = first?.cutout_media_id ? await readMedia(ctx.ws.id, first.cutout_media_id) : null;
  if (!main) throw new StepError("The cutout for this item is missing.");
  const png = first?.cutout_png_media_id ? await readMedia(ctx.ws.id, first.cutout_png_media_id) : null;
  return { main: main.data, product: png?.data ?? main.data };
}

export async function writeStep(ctx: ListingStepContext): Promise<ListingText> {
  const p = await plan(ctx);
  const text = ListingText.parse(
    await meta().write(call(ctx, "write"), await originalPhoto(ctx), p, ctx.workspace.settings.brandVoice),
  );
  await ctx.ws.saveListingText(ctx.listing.id, "en", text, {
    confidence: text.confidence,
    checkNotes: text.check_notes,
    status: text.confidence < REVIEW_THRESHOLD ? "needs_review" : "ready",
  });
  return text;
}

export async function translateStep(ctx: ListingStepContext): Promise<BanglaText> {
  const en = ListingText.safeParse(ctx.listing.fields_json?.en);
  if (!en.success) throw new StepError("The English listing isn't written yet.");
  const bn = await meta().translate(call(ctx, "translate"), en.data);
  await ctx.ws.saveListingText(ctx.listing.id, "bn", bn);
  return bn;
}

/**
 * Studio and banner keep the product's real pixels: a generated background, then the
 * cutout composited on top, with the shadow matching how the photo was taken. Lifestyle
 * is an AI edit of the white cutout image and is labelled "AI scene".
 */
export async function renderStep(ctx: ListingStepContext, scene: Scene): Promise<RenderResult> {
  const p = await plan(ctx);
  const { main, product } = await itemImages(ctx);
  const step = call(ctx, "render");
  let image: Buffer;
  if (scene === "lifestyle") {
    image = await meta().editScene(step, main, scene, p.sam_phrase);
  } else {
    const bg = await meta().background(step, scene, p.camera_angle);
    const size =
      scene === "banner" ? { width: 1536, height: 768, scale: 0.8 } : { width: 1024, height: 1024, scale: 0.72 };
    image = await compositeOnBackground(bg, product, {
      ...size,
      shadow: p.camera_angle === "top_down" && scene !== "banner" ? "drop" : "contact",
    });
  }
  const { width, height } = await dimensions(image);
  const sort = { studio: 1, lifestyle: 2, banner: 3 }[scene];
  const media = await saveMedia(ctx.ws.id, scene, image, {
    mime: "image/jpeg",
    width,
    height,
    listingId: ctx.listing.id,
    sort,
  });
  return { scene, mediaId: media.id, aiLabel: scene === "lifestyle" ? "ai_scene" : "ai_background" };
}
