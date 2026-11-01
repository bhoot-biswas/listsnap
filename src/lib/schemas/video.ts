import { z } from "zod";
import { SellerFacts } from "./voice-note";

/** The longest video watched; Muse Spark Open takes five minutes, and a rack rarely needs three. */
export const VIDEO_MAX_S = 180;
/** What a phone films in three minutes at 1080p, with room to spare. */
export const VIDEO_MAX_MB = 200;
/** Products made from one video, like a bulk upload's photos. */
export const VIDEO_MAX_PRODUCTS = 12;

/**
 * One product Muse Spark Open saw in the seller's video, with what the seller said about
 * it while it was on screen. The facts are only what was said, as with a voice note.
 */
export const VideoProduct = SellerFacts.extend({
  best_frame_s: z
    .number()
    .describe("The second where this product is seen best: whole, sharp, still, and not covered by a hand"),
  phrase: z
    .string()
    .describe("Short English noun phrase for the product, 1-4 words, e.g. 'red jamdani saree', 'navy panjabi'"),
  said: z
    .string()
    .describe(
      "What the seller said about this product, copied from the transcript in their own words; empty if nothing",
    ),
});
export type VideoProduct = z.infer<typeof VideoProduct>;

export const VideoProducts = z.object({
  products: z
    .array(VideoProduct)
    .describe(
      "Each distinct product shown, once, in the order it first appears; at most 12. The same product filmed twice is one product.",
    ),
});

/** The watch step's result: how many products were found, and how many became jobs. */
export const WatchResult = z.object({
  found: z.number().int(),
  jobs: z.number().int(),
  /** Products left out because today's listings ran out. */
  limited: z.number().int(),
});
export type WatchResult = z.infer<typeof WatchResult>;
