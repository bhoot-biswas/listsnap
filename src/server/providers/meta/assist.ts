import "server-only";
import { AssistResult, FIELD_MAX, type AssistAction, type AssistField } from "@/lib/schemas/assist";
import { logged } from "../log";
import type { AssistInput, CallContext } from "../types";
import { BANGLA_SYSTEM, writeSystem } from "./prompts";
import { SPARK_MODEL, sparkJson } from "./spark";

/**
 * Review's per-field help through Muse Spark: one field in, one field out. The rest of
 * the listing goes along as facts to keep, so a rewrite can't drift from the product.
 * No photo is sent: the text already says what the photo showed, and leaving it out
 * keeps a click at about a cent.
 */

const FIELD_RULES: Record<AssistField, string> = {
  title: "a product title of at most 70 characters, no ALL CAPS, no emoji",
  short_description: "a short description of one or two sentences, at most 160 characters",
  description:
    "a buyer-facing description of 3-6 short paragraphs or lines in plain text, with a blank line between paragraphs",
};

const ACTIONS: Record<AssistAction, string> = {
  rewrite: "Write a fresh version with the same facts: new wording and structure, nothing added or dropped.",
  shorter: "Make it clearly shorter, about half as long, keeping the facts a buyer needs most.",
  longer:
    "Make it more helpful with more detail for buyers (use, care, styling, who it suits), using only the facts " +
    "given. Never invent materials, sizes, measurements or brand names.",
  translate:
    "Write this field in natural Bangla from the English version given. Keep the facts identical; don't translate " +
    "word for word.",
};

export const assistPrompt = (input: AssistInput) => ({
  system:
    input.lang === "bn"
      ? `${BANGLA_SYSTEM} Here you write one field only; the instruction below decides its length.`
      : writeSystem(input.voice),
  userText: [
    `Field: ${FIELD_RULES[input.field]}.`,
    `Task: ${ACTIONS[input.action]}`,
    `Product facts: ${JSON.stringify(input.product)}`,
    input.action === "translate" ? `English version:\n${input.source}` : `Current text:\n${input.text}`,
    input.action === "translate" && input.text.trim() ? `Current Bangla text, to improve on:\n${input.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n"),
});

export async function liveAssist(ctx: CallContext, input: AssistInput): Promise<string> {
  const r = await logged(
    ctx,
    { provider: "meta", model: SPARK_MODEL, endpoint: "chat/completions", mode: "live" },
    () => sparkJson({ name: "FieldText", schema: AssistResult, ...assistPrompt(input) }),
    (r) => ({ summary: `${input.action} ${input.lang} ${input.field}`, costUsd: r.costUsd }),
  );
  return r.data.text.trim().slice(0, FIELD_MAX[input.field]);
}
