import { z } from "zod";

export const BRAND_COLORS_MAX = 3;
/** The setting photo is one picture of a room; anything bigger is a mistake, not a better photo. */
export const BRAND_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const Hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toUpperCase());

/**
 * The shop's look for AI photos: up to three brand colours and a photo of the seller's own
 * shop. Lifestyle photos are set in that shop and lean toward those colours; the banner
 * takes the colours. Studio photos never use it.
 */
export const BrandKit = z.object({
  // the same colour twice (#7a1f2b and #7A1F2B) is one colour
  colors: z
    .array(Hex)
    .max(BRAND_COLORS_MAX)
    .transform((cs) => [...new Set(cs)]),
  settingMediaId: z.string().uuid().nullable(),
});
export type BrandKit = z.infer<typeof BrandKit>;

export const EMPTY_BRAND_KIT: BrandKit = { colors: [], settingMediaId: null };

export const hasBrandKit = (kit: BrandKit) => kit.colors.length > 0 || kit.settingMediaId !== null;

/** The Settings form: colour pickers always send a value, so a checkbox says whether to use them. */
export function brandKitFromForm(form: FormData) {
  const use = form.get("useColors") === "on";
  const colors = use ? form.getAll("colors").filter((c): c is string => typeof c === "string" && c !== "") : [];
  const setting = form.get("settingMediaId");
  return BrandKit.safeParse({
    colors,
    settingMediaId: typeof setting === "string" && setting !== "" ? setting : null,
  });
}
