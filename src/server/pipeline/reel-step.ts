import "server-only";
import { StepError } from "./run-step";
import type { ListingStepContext } from "./listing-steps";
import { readMedia, saveMedia } from "@/server/media/store";
import { video } from "@/server/providers";
import { pickPhotos, reelVariables } from "@/server/reels/inputs";
import { REEL_LANGS, type ReelLang, type ReelResult, type ReelTemplate } from "@/lib/schemas/reels";

/**
 * Step `reel` (on request): one 9:16 video of a finished listing in one language, made
 * from the photos the seller ticked and the saved text. No AI is called; the cost is
 * render time, so it has its own daily count instead of using AI photos.
 */
export async function reelStep(ctx: ListingStepContext, lang: ReelLang, template: ReelTemplate): Promise<ReelResult> {
  const { ws, workspace, listing } = ctx;
  const text = listing.fields_json?.[lang] as { title?: string } | undefined;
  if (!text?.title)
    throw new StepError(
      lang === "bn"
        ? "This listing has no Bangla text yet, so a Bangla reel can't be made."
        : "This listing has no title yet.",
    );
  if (listing.price_bdt === null) throw new StepError("Add a price first; the reel shows it.");

  const [items, media] = await Promise.all([ws.items(listing.job_id), ws.listingMedia([listing.id])]);
  const mainId = items.find((i) => i.id === listing.item_ids_json[0])?.cutout_media_id;
  if (!mainId) throw new StepError("The main image for this listing is missing.");
  const photos = pickPhotos(
    media.map((m) => ({ id: m.id, kind: m.kind, selected: m.selected === 1 })),
    mainId,
  );
  const files = await Promise.all(
    [photos.hero, photos.look1, photos.look2, photos.product].map((id) => readMedia(ws.id, id)),
  );
  if (files.some((f) => !f)) throw new StepError("One of the photos for this reel is missing.");
  const [hero, look1, look2, product] = files.map((f) => f!.data);

  const variables = reelVariables({
    lang,
    title: text.title,
    priceBdt: listing.price_bdt,
    shop: workspace.name,
    labels: photos.labels,
    kit: workspace.settings.brandKit.colors,
  });

  if (!(await ws.reserveReel()))
    throw new StepError("You've made today's reels. More can be made after 6:00 AM Bangladesh time.");
  const reel = await video()
    .renderReel(
      { workspaceId: ws.id, jobId: listing.job_id, step: "reel" },
      { template, photos: { hero, look1, look2, product }, variables },
    )
    .catch(async (err: unknown) => {
      await ws.releaseReel();
      throw err;
    });
  const saved = await saveMedia(ws.id, "reel", reel.data, {
    mime: "video/mp4",
    width: reel.width,
    height: reel.height,
    listingId: listing.id,
    sort: 100 + REEL_LANGS.indexOf(lang),
    fromMediaId: photos.hero,
    selected: false,
  });
  return { template, lang, mediaId: saved.id, aiLabel: photos.aiScene ? "ai_scene" : null, seconds: reel.seconds };
}
