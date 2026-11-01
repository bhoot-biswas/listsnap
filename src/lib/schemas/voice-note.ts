import { z } from "zod";

/** The longest voice note the recorder makes; the server cuts anything longer. */
export const VOICE_NOTE_MAX_S = 60;

/**
 * What the seller said about the product in their voice note, read by Muse Spark Open
 * from the transcript. Only what was said: anything not said is null or empty, so the
 * photo's guesses never pass for the seller's words.
 */
export const SellerFacts = z.object({
  price_bdt: z
    .number()
    .nullable()
    .describe("The price the seller said, in taka, as a number (দেড় হাজার = 1500); null if no price was said"),
  sizes: z
    .array(z.string())
    .describe("Sizes as the seller said them, e.g. 'M', 'L', 'XL' or one range like '40-44'; never expand a range"),
  colors: z.array(z.string()).describe("Colours the seller named, in English"),
  stock: z.number().int().nullable().describe("How many the seller said they have; null if not said"),
  material: z.string().nullable().describe("Fabric or material the seller named, in English; null if not said"),
  notes: z
    .array(z.string())
    .describe("Other things a buyer should know that the seller said (care, delivery, what's included), in English"),
});
export type SellerFacts = z.infer<typeof SellerFacts>;

/**
 * The `listen` step. `heardBy` says how: Muse Voice Transcribe's words, or Muse Spark
 * Open hearing the audio itself when Transcribe failed, which the spike showed can get
 * the price wrong, so Review asks the seller to check it then. `video`: the job came
 * from a video, and this is what the seller said while its product was on screen.
 */
export const ListenResult = z.object({
  transcript: z.string(),
  heardBy: z.enum(["transcribe", "audio", "video"]),
  facts: SellerFacts.nullable(),
});
export type ListenResult = z.infer<typeof ListenResult>;

/** Facts with nothing in them, as when the seller said nothing about the product. */
export const saidNothing = (f: SellerFacts) =>
  f.price_bdt === null &&
  f.stock === null &&
  f.material === null &&
  !f.sizes.length &&
  !f.colors.length &&
  !f.notes.length;
