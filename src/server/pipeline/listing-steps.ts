import "server-only";
import { checkFidelity } from "./fidelity";
import { lookBrief } from "./looks";
import { StepError } from "./run-step";
import { compositeOnBackground, dimensions, fillsFrame, squarePhoto } from "@/server/image-ops";
import { readMedia, saveMedia } from "@/server/media/store";
import { meta } from "@/server/providers";
import type { SceneKit } from "@/server/providers/types";
import type { ListingRow, WorkspaceScope } from "@/server/db/scope";
import { brandVoice, type Workspace } from "@/server/db/workspaces";
import {
  ListingText,
  sceneBrief,
  type BanglaText,
  type PlanResult,
  type RenderResult,
  type Scene,
  type SceneBrief,
} from "@/lib/schemas/pipeline";
import type { BrandKit } from "@/lib/schemas/brand-kit";
import { LOOKS, lookKind, type Look, type LookResult } from "@/lib/schemas/looks";
import { ListenResult, type SellerFacts } from "@/lib/schemas/voice-note";

/** Per-listing steps: write (English), translate (Bangla), render (one scene per call), look (on request). */

export interface ListingStepContext {
  ws: WorkspaceScope;
  workspace: Workspace;
  listing: ListingRow;
}

const call = (ctx: ListingStepContext, step: string) => ({ workspaceId: ctx.ws.id, jobId: ctx.listing.job_id, step });

async function plan(ctx: ListingStepContext): Promise<PlanResult> {
  const p = await ctx.ws.stepResult<PlanResult>(ctx.listing.job_id, "plan");
  if (!p) throw new StepError("stepNotDone");
  return p;
}

async function originalPhoto(ctx: ListingStepContext): Promise<Buffer> {
  const [photo] = await ctx.ws.photos(ctx.listing.job_id);
  const file = photo ? await readMedia(ctx.ws.id, photo.media_id) : null;
  if (!file) throw new StepError("photoMissing");
  return file.data;
}

/**
 * The listing's first item, as renders need it: `main` is the white 1:1 image (what the
 * lifestyle edit starts from); `product` is the transparent cutout when SAM made one,
 * so composites place the product itself rather than a white square. `fullFrame` is an
 * item that fills its photo, which the segment step left uncut.
 */
async function itemImages(
  ctx: ListingStepContext,
): Promise<{ main: Buffer; product: Buffer; mainId: string; productId: string; fullFrame: boolean }> {
  const items = await ctx.ws.items(ctx.listing.job_id);
  const first = items.find((i) => i.id === ctx.listing.item_ids_json[0]);
  const main = first?.cutout_media_id ? await readMedia(ctx.ws.id, first.cutout_media_id) : null;
  if (!main || !first?.cutout_media_id) throw new StepError("cutoutMissing");
  const png = first.cutout_png_media_id ? await readMedia(ctx.ws.id, first.cutout_png_media_id) : null;
  const photo = (await ctx.ws.photos(ctx.listing.job_id)).find((p) => p.id === first.photo_id);
  return {
    main: main.data,
    product: png?.data ?? main.data,
    mainId: first.cutout_media_id,
    productId: png ? first.cutout_png_media_id! : first.cutout_media_id,
    fullFrame: !png && !!photo && fillsFrame(first.box_json, photo.width, photo.height),
  };
}

/**
 * What the seller said in their voice note, for this listing. One note describes one
 * product, so a photo that became several separate listings uses it for none of them.
 */
async function spoken(ctx: ListingStepContext): Promise<ListenResult | null> {
  const heard = ListenResult.safeParse(await ctx.ws.stepResult(ctx.listing.job_id, "listen"));
  if (!heard.success || !heard.data.facts) return null;
  return (await ctx.ws.listings(ctx.listing.job_id)).length === 1 ? heard.data : null;
}

export async function writeStep(ctx: ListingStepContext): Promise<ListingText> {
  const p = await plan(ctx);
  const heard = await spoken(ctx);
  const said: SellerFacts | null = heard?.facts ?? null;
  const written = ListingText.parse(
    await meta().write(call(ctx, "write"), await originalPhoto(ctx), p, brandVoice(ctx.workspace.settings), said),
  );
  // heard from the audio alone, the price can be wrong (the spike's was), so it isn't filled in
  const guessed = heard?.heardBy === "audio" && said?.price_bdt != null;
  const text = guessed
    ? {
        ...written,
        check_notes: [`Check the price: we heard ৳${said!.price_bdt} in your voice note.`, ...written.check_notes],
      }
    : written;
  // Bangla and the photos are still to come, so the listing stays in Processing until
  // they settle; this also brings back a listing whose earlier write gave up
  await ctx.ws.saveListingText(ctx.listing.id, "en", text, {
    confidence: text.confidence,
    checkNotes: text.check_notes,
    status: "processing",
  });
  if (said && (said.price_bdt !== null || said.stock !== null))
    await ctx.ws.setSpokenPriceStock(ctx.listing.id, {
      priceBdt: guessed || said.price_bdt === null ? null : Math.round(said.price_bdt),
      stockQty: said.stock,
    });
  return text;
}

export async function translateStep(ctx: ListingStepContext): Promise<BanglaText> {
  const en = ListingText.safeParse(ctx.listing.fields_json?.en);
  if (!en.success) throw new StepError("englishNotWritten");
  const bn = await meta().translate(call(ctx, "translate"), en.data);
  await ctx.ws.saveListingText(ctx.listing.id, "bn", bn);
  return bn;
}

/** The shop's own colours win over the ones Spark suggested; the rest of the brief stays. */
function withBrandColors(brief: SceneBrief | null, colors: string[]): SceneBrief | null {
  if (!colors.length) return brief;
  return { setting: brief?.setting ?? "", avoid: brief?.avoid ?? [], palette: colors };
}

/**
 * With a shop setting photo, the lifestyle scene is set in the seller's shop. A photo that
 * has gone missing falls back to the brief's scene rather than failing the render.
 */
async function shopScene(ctx: ListingStepContext, kit: BrandKit): Promise<SceneKit | null> {
  if (!kit.settingMediaId) return null;
  const setting = await readMedia(ctx.ws.id, kit.settingMediaId);
  if (!setting) return null;
  return { original: await originalPhoto(ctx), setting: setting.data, colors: kit.colors };
}

/**
 * Studio and banner keep the product's real pixels: a generated background, then the
 * cutout composited on top, with the shadow matching how the photo was taken. Lifestyle
 * is an AI edit of the white cutout image, set in the seller's shop when the brand kit
 * has a setting photo, and is labelled "AI scene".
 */
/**
 * Runs `make` on one of today's AI photo slots, taken before Muse Image is paid for. The
 * slot comes back when the step fails before a photo was made (the breaker was open, the
 * call failed): otherwise the 2-second retries during an outage would use up the day's
 * photos with nothing to show. A photo that was made and then rejected still counts.
 */
async function onImageSlot<T>(ctx: ListingStepContext, make: (made: () => void) => Promise<T>): Promise<T> {
  if (!(await ctx.ws.reserveImage(ctx.workspace.limits.images)))
    // permanent: retrying today can't help, so it shouldn't spend the step's attempts
    throw new StepError("imagesUsedUp", { permanent: true });
  let billed = false;
  try {
    return await make(() => {
      billed = true;
    });
  } catch (err) {
    if (!billed) await ctx.ws.releaseImage();
    throw err;
  }
}

/**
 * A scene that redraws the product (lifestyle, a look) is kept only if it is still the
 * seller's product; a failed attempt is retried by the step rules with a fresh image.
 */
async function checkedScene(
  step: ReturnType<typeof call>,
  input: { main: Buffer; product: Buffer; phrase: string; brief: SceneBrief | null; kit: SceneKit | null },
  made: () => void,
): Promise<{ image: Buffer; check: { same: true; colorSimilarity: number | null } }> {
  const image = await meta().editScene(step, input.main, "lifestyle", input.phrase, input.brief, input.kit);
  made();
  const fidelity = await checkFidelity(step, input.product, image, input.phrase);
  if (!fidelity.same) throw new StepError("productChanged", { params: { differences: fidelity.differences } });
  return { image, check: { same: true, colorSimilarity: fidelity.colorSimilarity } };
}

export async function renderStep(ctx: ListingStepContext, scene: Scene): Promise<RenderResult> {
  const p = await plan(ctx);
  const { main, product, mainId, productId, fullFrame } = await itemImages(ctx);
  if (scene === "studio" && fullFrame) {
    // a rectangle of the photo pasted on a backdrop looks like a scrap, not a studio shot;
    // the photo itself is the better one, and costs no Muse Image call or daily image
    const image = await squarePhoto(await originalPhoto(ctx));
    const { width, height } = await dimensions(image);
    const media = await saveMedia(ctx.ws.id, scene, image, {
      mime: "image/jpeg",
      width,
      height,
      listingId: ctx.listing.id,
      sort: 1,
      fromMediaId: productId,
    });
    return { scene, mediaId: media.id, aiLabel: "photo" };
  }
  const step = call(ctx, "render");
  const kit = ctx.workspace.settings.brandKit;
  const brief = withBrandColors(sceneBrief(p), kit.colors);
  type Made = { image: Buffer; check?: RenderResult["check"] };
  const { image, check } = await onImageSlot<Made>(ctx, async (made) => {
    if (scene === "lifestyle")
      return checkedScene(step, { main, product, phrase: p.sam_phrase, brief, kit: await shopScene(ctx, kit) }, made);
    const bg = await meta().background(step, scene, p.camera_angle, brief);
    made();
    // the banner keeps the left side free for a title, and gets the same shadow as the photo's
    // angle would cast: an outline below a flat lay, a contact shadow on a tabletop
    const size =
      scene === "banner"
        ? { width: 1536, height: 768, scale: 0.8, centerX: 0.66 }
        : { width: 1024, height: 1024, scale: 0.72 };
    const image = await compositeOnBackground(bg, product, {
      ...size,
      shadow: p.camera_angle === "top_down" ? "drop" : "contact",
    });
    return { image };
  });
  const { width, height } = await dimensions(image);
  const sort = { studio: 1, lifestyle: 2, banner: 3 }[scene];
  const media = await saveMedia(ctx.ws.id, scene, image, {
    mime: "image/jpeg",
    width,
    height,
    listingId: ctx.listing.id,
    sort,
    // lifestyle edits the white main image; composites place the cutout
    fromMediaId: scene === "lifestyle" ? mainId : productId,
  });
  return {
    scene,
    mediaId: media.id,
    aiLabel: scene === "lifestyle" ? "ai_scene" : "ai_background",
    ...(check ? { check } : {}),
  };
}

/**
 * A campaign look the seller asked for on Review: the lifestyle scene, set for the
 * occasion instead of the shop, and checked against the product the same way.
 */
export async function lookStep(ctx: ListingStepContext, look: Look): Promise<LookResult> {
  const p = await plan(ctx);
  const { main, product, mainId } = await itemImages(ctx);
  const { image, check } = await onImageSlot(ctx, (made) =>
    checkedScene(
      call(ctx, "look"),
      { main, product, phrase: p.sam_phrase, brief: lookBrief(look, sceneBrief(p)), kit: null },
      made,
    ),
  );
  const { width, height } = await dimensions(image);
  const media = await saveMedia(ctx.ws.id, lookKind(look), image, {
    mime: "image/jpeg",
    width,
    height,
    listingId: ctx.listing.id,
    // after the automatic scenes, in the order the looks are offered
    sort: 10 + LOOKS.indexOf(look),
    fromMediaId: mainId,
  });
  return { look, mediaId: media.id, aiLabel: "ai_scene", check };
}
