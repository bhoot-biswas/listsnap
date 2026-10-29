import { z } from "zod";

/**
 * Per-field AI help on Review: rewrite one text field, make it shorter or more
 * detailed, or write the Bangla field from the English one. The browser sends the text
 * as it is on screen, since autosave may not have stored the last keystrokes yet.
 */

export const AssistField = z.enum(["title", "short_description", "description"]);
export type AssistField = z.infer<typeof AssistField>;

export const AssistAction = z.enum(["rewrite", "shorter", "longer", "translate"]);
export type AssistAction = z.infer<typeof AssistAction>;

/** The most each field takes, as on Review; answers are cut to fit. */
export const FIELD_MAX: Record<AssistField, number> = { title: 200, short_description: 600, description: 8000 };

export const AssistRequest = z
  .object({
    field: AssistField,
    action: AssistAction,
    lang: z.enum(["en", "bn"]),
    text: z.string().max(8000),
    /** The English field, for `translate`. */
    source: z.string().max(8000).optional(),
  })
  .refine((r) => r.action !== "translate" || (r.lang === "bn" && !!r.source?.trim()), "Translate needs English text")
  .refine((r) => r.action === "translate" || !!r.text.trim(), "Nothing to change")
  .refine((r) => r.field !== "title" || r.action !== "longer", "Titles stay short");
export type AssistRequest = z.infer<typeof AssistRequest>;

/** Which buttons a field shows, per language. */
export function assistActions(field: AssistField, lang: "en" | "bn"): AssistAction[] {
  const base: AssistAction[] = field === "title" ? ["rewrite", "shorter"] : ["rewrite", "shorter", "longer"];
  return lang === "bn" ? [...base, "translate"] : base;
}

/** What Spark answers: only the new text. */
export const AssistResult = z.object({
  text: z.string().min(1).describe("The new text for the field, plain text, nothing else"),
});
