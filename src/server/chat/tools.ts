import "server-only";
import { z } from "zod";
import { ops, type Op, type OpResult } from "@/server/ops";
import type { Workspace } from "@/server/db/workspaces";
import { forWorkspace } from "@/server/db/scope";
import { BanglaText, ListingText } from "@/lib/schemas/pipeline";
import { CAPTION_MAX } from "@/lib/schemas/social";
import type { ToolCall } from "@/lib/schemas/chat";
import type { StepOutcome } from "@/server/pipeline/run-step";
import { defaultCaption } from "@/server/social/caption";
import type { ChatTool } from "@/server/providers/types";

/**
 * The listing chat's tools are ops from the registry, so they keep every op rule: auth
 * by workspace, Zod input, idempotency, undo and the op_runs record. The listing id is
 * fixed by the server and left out of each tool's input, so the model can't point a tool
 * at another listing.
 */

const LISTING_TOOLS = [
  "getListingSummary",
  "editListingFields",
  "undoLast",
  "renderScene",
  "renderLook",
  "makeReel",
  "postReel",
  "saveDraftToStore",
] as const;
export type ToolName = (typeof LISTING_TOOLS)[number];

const opFor = (name: string): Op | null =>
  (LISTING_TOOLS as readonly string[]).includes(name) ? (ops[name as ToolName] as Op) : null;

/** The model may leave out a reel's caption; the default one from the listing is used, and the seller sees it before posting. */
function chatInput(name: ToolName): z.ZodObject {
  const input = (ops[name].input as z.ZodObject).omit({ listingId: true });
  return name === "postReel" ? input.extend({ caption: z.string().trim().min(1).max(CAPTION_MAX).optional() }) : input;
}

export function listingTools(): ChatTool[] {
  return LISTING_TOOLS.map((name) => {
    const parameters: Record<string, unknown> = z.toJSONSchema(chatInput(name), {
      io: "input",
      unrepresentable: "any",
    });
    delete parameters.$schema;
    const extra =
      name === "postReel"
        ? " Leave out the caption to use the listing's own; the seller sees it before anything is posted."
        : "";
    return { name, description: ops[name].description + extra, parameters };
  });
}

/** Saving to the store and posting are public: the seller approves each one on a card. */
export const needsApproval = (name: string) => opFor(name)?.effect === "changes_store";

/** Makes AI photos or reels, which cost the seller's daily quota and a minute each. */
export const makesMedia = (name: string) => opFor(name)?.effect === "creates_media";

/** Changes something the page shows, so it reloads once the chat is done. */
export const changesListing = (name: string) => !!opFor(name) && opFor(name)!.effect !== "read";

export type Checked = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

/**
 * Checks a call's arguments and completes them, before the call is stored: an approval
 * card must show exactly what will be sent, and the seller approves those stored args.
 */
export async function checkArgs(
  workspace: Workspace,
  listingId: string,
  name: string,
  argsJson: string,
): Promise<Checked> {
  if (!opFor(name)) return { ok: false, error: `There is no tool called ${name}.` };
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson || "{}");
  } catch {
    return { ok: false, error: "The arguments weren't valid JSON." };
  }
  const parsed = chatInput(name as ToolName).safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error).slice(0, 300)}` };
  const args = parsed.data as Record<string, unknown>;
  if (name === "postReel" && !args.caption) {
    const caption = await listingCaption(workspace, listingId, args.lang as "en" | "bn");
    if (!caption) return { ok: false, error: "This listing has no text in that language to write a caption from." };
    args.caption = caption;
  }
  return { ok: true, args };
}

async function listingCaption(workspace: Workspace, listingId: string, lang: "en" | "bn") {
  const listing = await forWorkspace(workspace.id).getListing(listingId);
  const text = (lang === "en" ? ListingText : BanglaText).safeParse(listing?.fields_json?.[lang]);
  if (!listing || !text.success) return null;
  return defaultCaption({
    lang,
    title: text.data.title,
    shortDescription: text.data.short_description,
    priceBdt: listing.price_bdt,
    tags: text.data.tags,
  });
}

const ERROR_TEXT: Record<string, string> = {
  invalid: "The request wasn't valid.",
  not_found: "That isn't in this shop.",
  not_ready: "That can't be done yet.",
  needs_confirmation: "This needs the seller's approval.",
  busy: "That is already running; it will appear on the page when it's done.",
  failed: "It didn't work.",
};

/**
 * Runs a checked call as its op. The result is small JSON the model can read: what
 * happened, or an error in the seller's words that it can explain or recover from.
 * The tool call id is the op's idempotency key, so a resent call never runs twice.
 */
export async function runTool(
  workspace: Workspace,
  listingId: string,
  call: ToolCall,
  confirmed = false,
): Promise<Record<string, unknown>> {
  const op = opFor(call.name);
  if (!op) return { ok: false, message: `There is no tool called ${call.name}.` };
  let r: OpResult<unknown>;
  try {
    r = await op.call(workspace, { ...call.args, listingId }, { via: "chat", idempotencyKey: call.id, confirmed });
  } catch (err) {
    console.error(`[chat] ${call.name} failed:`, err);
    return { ok: false, message: "Something went wrong on our side. Nothing else changed." };
  }
  if (!r.ok) return { ok: false, error: r.error, message: r.message ?? ERROR_TEXT[r.error] };
  const value = r.value as { outcome?: StepOutcome<unknown> } | null;
  if (!value || !value.outcome) return { ok: true, ...(value as object) };
  const outcome = value.outcome;
  if (outcome.state === "done") return { ok: true, done: true, result: outcome.result };
  if (outcome.state === "running") return { ok: true, stillWorking: true, message: ERROR_TEXT.busy };
  return { ok: false, error: "failed", message: outcome.error };
}
