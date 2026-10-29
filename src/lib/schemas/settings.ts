import { z } from "zod";

export const BRAND_VOICES = ["Friendly", "Professional", "Playful"] as const;
export const SCENES = ["studio", "lifestyle", "banner"] as const;
export const PRICE_ROUNDINGS = [1, 10, 50, 100] as const;
export const BRAND_NOTE_MAX = 160;

/**
 * The Settings form. Checkboxes arrive as repeated fields (scenes) or "on"; everything
 * else is text. English is always on: the store's listing is written in English first.
 */
export const SettingsForm = z.object({
  name: z.string().trim().min(2).max(80),
  mainCategory: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v || null),
  brandVoice: z.enum(BRAND_VOICES),
  brandNote: z
    .string()
    .trim()
    .max(BRAND_NOTE_MAX)
    .transform((v) => v || null),
  scenes: z.array(z.enum(SCENES)).max(SCENES.length),
  priceRounding: z.coerce.number().pipe(z.union(PRICE_ROUNDINGS.map((n) => z.literal(n)))),
  bangla: z.boolean(),
});
export type SettingsForm = z.infer<typeof SettingsForm>;

export const settingsFromForm = (form: FormData) =>
  SettingsForm.safeParse({
    name: form.get("name") ?? "",
    mainCategory: form.get("mainCategory") ?? "",
    brandVoice: form.get("brandVoice"),
    brandNote: form.get("brandNote") ?? "",
    scenes: [...new Set(form.getAll("scenes"))],
    priceRounding: form.get("priceRounding"),
    bangla: form.get("bangla") === "on",
  });
