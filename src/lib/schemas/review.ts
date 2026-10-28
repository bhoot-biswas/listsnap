import { z } from "zod";
import { Variants } from "@/lib/variants";

/**
 * What the seller can change on Review. Autosave sends the whole thing each time, so
 * the server never merges half an edit. Limits follow the store and the UI counters,
 * with room to spare: the counters warn, these only stop abuse.
 */

export const TITLE_MAX = 70;
export const SHORT_MAX = 160;

const Attribute = z.object({ name: z.string().trim().max(60), value: z.string().trim().max(200) });

const Text = {
  title: z.string().trim().max(200),
  short_description: z.string().trim().max(600),
  description: z.string().trim().max(8000),
  attributes: z.array(Attribute).max(30),
  tags: z.array(z.string().trim().min(1).max(60)).max(30),
};

export const EnglishEdit = z.object({ ...Text, category: z.string().trim().max(120) });
export const BanglaEdit = z.object(Text);

export const ListingEdit = z.object({
  en: EnglishEdit,
  bn: BanglaEdit.nullable(),
  priceBdt: z.number().int().min(0).max(10_000_000).nullable(),
  stockQty: z.number().int().min(0).max(1_000_000).nullable(),
  /** Scene media to send to the store; the main image always goes. */
  selectedMediaIds: z.array(z.string().uuid()).max(20),
  /** Colour variants, for a listing of one design in several colours; otherwise null. */
  variants: Variants.nullable(),
});
export type ListingEdit = z.infer<typeof ListingEdit>;

/** The price to start from when the seller hasn't set one: the middle of Spark's range, rounded the shop's way. */
export function suggestedPrice(hint: { low: number; high: number }, rounding: number): number | null {
  if (!(hint.low > 0 && hint.high >= hint.low)) return null;
  const step = rounding > 0 ? rounding : 1;
  return Math.round((hint.low + hint.high) / 2 / step) * step;
}
