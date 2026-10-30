import { z } from "zod";

/**
 * Campaign looks: the same product photographed for an occasion. The seller picks them on
 * Review; each is one AI photo, labelled as an AI scene like lifestyle.
 */
export const LOOKS = ["eid", "boishakh", "minimal", "outdoor", "wedding"] as const;
export const Look = z.enum(LOOKS);
export type Look = z.infer<typeof Look>;

export type LookKind = `look_${Look}`;
export const lookKind = (look: Look): LookKind => `look_${look}`;

/** The look a media kind holds, or null for any other kind. */
export function lookOf(kind: string): Look | null {
  const parsed = Look.safeParse(kind.startsWith("look_") ? kind.slice(5) : "");
  return parsed.success ? parsed.data : null;
}

/** Step 6b `look`: one look of one listing. */
export const LookResult = z.object({
  look: Look,
  mediaId: z.string(),
  aiLabel: z.literal("ai_scene"),
  check: z.object({ same: z.literal(true), colorSimilarity: z.number().nullable() }),
});
export type LookResult = z.infer<typeof LookResult>;
