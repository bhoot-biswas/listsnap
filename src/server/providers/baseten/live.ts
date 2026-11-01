import "server-only";
import { z } from "zod";
import { SellerFacts } from "@/lib/schemas/voice-note";
import { VIDEO_MAX_PRODUCTS, VideoProducts } from "@/lib/schemas/video";
import { logged } from "../log";
import { photoDataUrl } from "../meta/spark";
import type { BasetenProvider } from "../types";
import { OPEN_MODEL, openJson } from "./muse-open";

const FACTS_SYSTEM =
  "You help small online sellers in Bangladesh. The seller recorded a voice note about the product in the photo, " +
  "in Bangla, English or both. Write down only what the seller actually said: the price in taka (turn words like " +
  "'দেড় হাজার' into 1500, 'বারোশো' into 1200), sizes, colours, how many are in stock, the material and other " +
  "things a buyer needs to know. The photo only helps you understand which product they mean: never take a fact " +
  "from the photo, a price tag or a label. A transcript can repeat a word by mistake; read through that. " +
  "Leave anything not said as null or empty.";

// the spike's photos were 1280 px; the photo only says which product is meant, so less is plenty
const PHOTO_PX = 768;

const HeardFacts = z.object({
  heard: z.string().describe("What the seller said, word for word, in the language they spoke"),
  facts: SellerFacts,
});

const WATCH_SYSTEM =
  "You help small online sellers in Bangladesh. The seller filmed their products while talking about them, in " +
  "Bangla, English or both. You get the video and a transcript of their speech with times. List each distinct " +
  "product once, and match what the seller said to the product on screen at that time. Take prices, sizes, " +
  "stock, colours and material only from what the seller said (turn 'দেড় হাজার' into 1500): never from the " +
  "picture, a price tag or a label, and leave them null or empty when nothing was said. Keep a size range as the " +
  "seller said it ('40-44'). For each product pick the moment it is seen best: whole, sharp, still, not " +
  "covered by a hand.";

/** A minute or three of video takes a while to watch; the watch step's lock allows for it. */
const WATCH_BUDGET_MS = 150_000;

const info = (endpoint: string) => ({ provider: "baseten", model: OPEN_MODEL, endpoint, mode: "live" }) as const;

const summary = (f: SellerFacts) =>
  [
    f.price_bdt !== null && `৳${f.price_bdt}`,
    f.sizes.length && `sizes ${f.sizes.join("/")}`,
    f.stock !== null && `stock ${f.stock}`,
    f.material,
    f.notes.length && `${f.notes.length} notes`,
  ]
    .filter(Boolean)
    .join(" · ") || "nothing about the product";

export const liveBaseten: BasetenProvider = {
  mode: "live",

  facts: async (ctx, transcript, photo) => {
    const image = await photoDataUrl(photo, PHOTO_PX);
    const r = await logged(
      ctx,
      info("chat/completions"),
      () =>
        openJson({
          name: "SellerFacts",
          schema: SellerFacts,
          system: FACTS_SYSTEM,
          content: [
            { type: "text", text: `The seller's voice note, transcribed:\n"${transcript.replace(/"/g, "'")}"` },
            { type: "image_url", image_url: { url: image } },
          ],
        }),
      (r) => ({ summary: summary(r.data) + (r.requests > 1 ? " · retried" : ""), costUsd: r.costUsd }),
    );
    return r.data;
  },

  factsFromAudio: async (ctx, wav, photo) => {
    const image = await photoDataUrl(photo, PHOTO_PX);
    const r = await logged(
      ctx,
      info("chat/completions (audio)"),
      () =>
        openJson({
          name: "HeardFacts",
          schema: HeardFacts,
          system: FACTS_SYSTEM,
          tool: true,
          content: [
            { type: "text", text: "The seller's voice note is attached." },
            { type: "audio_url", audio_url: { url: `data:audio/wav;base64,${wav.toString("base64")}` } },
            { type: "image_url", image_url: { url: image } },
          ],
        }),
      (r) => ({ summary: `from audio · ${summary(r.data.facts)}`, costUsd: r.costUsd }),
    );
    return r.data;
  },

  watch: async (ctx, mp4, transcript) => {
    const r = await logged(
      ctx,
      info("chat/completions (video)"),
      () =>
        openJson({
          name: "VideoProducts",
          schema: VideoProducts,
          system: WATCH_SYSTEM,
          tool: true,
          budgetMs: WATCH_BUDGET_MS,
          content: [
            { type: "text", text: `What the seller said, with times:\n${transcript || "(no speech)"}` },
            { type: "video_url", video_url: { url: `data:video/mp4;base64,${mp4.toString("base64")}` } },
          ],
        }),
      (r) => ({
        summary: `${r.data.products.length} products · ${r.data.products.filter((p) => p.price_bdt !== null).length} with a price`,
        costUsd: r.costUsd,
      }),
    );
    return r.data.products.slice(0, VIDEO_MAX_PRODUCTS);
  },
};
