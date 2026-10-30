import { z } from "zod";

/**
 * Reels: a short 9:16 video of one listing, rendered from a template we wrote, filled
 * only with the listing's saved photos and text. One reel per language.
 */
export const REEL_LANGS = ["en", "bn"] as const;
export const ReelLang = z.enum(REEL_LANGS);
export type ReelLang = z.infer<typeof ReelLang>;

export const REEL_TEMPLATES = ["showcase"] as const;
export const ReelTemplate = z.enum(REEL_TEMPLATES);
export type ReelTemplate = z.infer<typeof ReelTemplate>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * What a template is filled with. The CLI doesn't enforce lengths, so this does, before
 * anything renders; the template also shrinks a long title to fit as a second guard.
 */
export const ReelVariables = z.object({
  title: z.string().min(1).max(80),
  price: z.string().min(1).max(20),
  shop: z.string().min(1).max(40),
  cta: z.string().min(1).max(40),
  look1Label: z.string().max(24),
  look2Label: z.string().max(24),
  ground: hex,
  ink: hex,
  accent: hex,
  gold: hex,
  lang: ReelLang,
});
export type ReelVariables = z.infer<typeof ReelVariables>;

/** Step `reel`: one reel of one listing in one language. */
export const ReelResult = z.object({
  template: ReelTemplate,
  lang: ReelLang,
  mediaId: z.string(),
  // a reel shows AI scenes, so it carries their label
  aiLabel: z.literal("ai_scene").nullable(),
  seconds: z.number(),
});
export type ReelResult = z.infer<typeof ReelResult>;
