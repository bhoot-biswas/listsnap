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
 * The chat's tools are ops from the registry, so they keep every op rule: auth by
 * workspace, Zod input, idempotency, undo and the op_runs record. In a listing's chat
 * the listing id is fixed by the server and left out of each tool's input, so the model
 * can't point a tool at another listing. The shop chat names listings itself, found
 * with findListings, and an id from another shop is simply "not found".
 */

/** Which chat: one listing's, or the whole shop's when `listingId` is null. */
export type ChatScope = { listingId: string | null };

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
const SHOP_TOOLS = ["getShopSummary", "findListings", "startListing", ...LISTING_TOOLS, "saveDraftsToStore"] as const;
export type ToolName = (typeof SHOP_TOOLS)[number];

const toolNames = (scope: ChatScope): readonly ToolName[] => (scope.listingId ? LISTING_TOOLS : SHOP_TOOLS);

const opFor = (name: string): Op | null =>
  (SHOP_TOOLS as readonly string[]).includes(name) ? (ops[name as ToolName] as Op) : null;

/** The model may leave out a reel's caption; the default one from the listing is used, and the seller sees it before posting. */
function chatInput(name: ToolName, scope: ChatScope): z.ZodObject {
  const own = ops[name].input as z.ZodObject;
  const input = scope.listingId && "listingId" in own.shape ? own.omit({ listingId: true }) : own;
  return name === "postReel" ? input.extend({ caption: z.string().trim().min(1).max(CAPTION_MAX).optional() }) : input;
}

export function chatTools(scope: ChatScope): ChatTool[] {
  return toolNames(scope).map((name) => {
    const parameters: Record<string, unknown> = z.toJSONSchema(chatInput(name, scope), {
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

/** Changes something a page shows, so it reloads once the chat is done. */
export const changesListing = (name: string) => !!opFor(name) && opFor(name)!.effect !== "read";

export type Checked =
  { ok: true; args: Record<string, unknown>; preview?: ToolCall["preview"] } | { ok: false; error: string };

/** Whether the model's call names one of this chat's tools with arguments its schema accepts. */
export function parseToolArgs(
  scope: ChatScope,
  name: string,
  argsJson: string,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (!(toolNames(scope) as readonly string[]).includes(name))
    return { ok: false, error: `There is no tool called ${name}.` };
  let raw: unknown;
  try {
    raw = JSON.parse(argsJson || "{}");
  } catch {
    return { ok: false, error: "The arguments weren't valid JSON." };
  }
  const parsed = chatInput(name as ToolName, scope).safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error).slice(0, 300)}` };
  return { ok: true, args: parsed.data as Record<string, unknown> };
}

/**
 * Checks a call's arguments and completes them, before the call is stored: an approval
 * card must show exactly what will be sent, and the seller approves those stored args.
 * In the shop chat the card also names the listings, since the seller can't see the ids.
 */
export async function checkArgs(
  workspace: Workspace,
  scope: ChatScope,
  name: string,
  argsJson: string,
): Promise<Checked> {
  const parsed = parseToolArgs(scope, name, argsJson);
  if (!parsed.ok) return parsed;
  const args = parsed.args;
  const listingId = scope.listingId ?? (args.listingId as string | undefined);
  if (name === "postReel" && listingId && !(await hasReel(workspace, listingId, args.lang as "en" | "bn")))
    // refused before a card is shown: the seller would approve a post that can only fail
    return { ok: false, error: NO_REEL };
  if (name === "postReel" && !args.caption) {
    const caption = listingId ? await listingCaption(workspace, listingId, args.lang as "en" | "bn") : null;
    if (!caption) return { ok: false, error: "This listing has no text in that language to write a caption from." };
    args.caption = caption;
  }
  if (scope.listingId || !needsApproval(name)) return { ok: true, args };
  const ids = name === "saveDraftsToStore" ? [...new Set(args.listingIds as string[])] : [listingId!];
  const titles = await listingTitles(workspace, ids);
  if (!titles) return { ok: false, error: "One of those listings isn't in this shop. Find it with findListings." };
  return { ok: true, args, preview: { titles } };
}

/** What the model hears when it tries to post a reel that isn't made yet. */
export const NO_REEL = "There's no reel in that language yet. Make it with makeReel first, then post it.";

async function hasReel(workspace: Workspace, listingId: string, lang: "en" | "bn"): Promise<boolean> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  return !!listing && !!(await ws.stepResult(listing.job_id, "reel", `${listingId}:showcase:${lang}`));
}

async function listingTitles(workspace: Workspace, ids: string[]): Promise<string[] | null> {
  const ws = forWorkspace(workspace.id);
  const listings = await Promise.all(ids.map((id) => ws.getListing(id)));
  if (listings.some((l) => !l)) return null;
  return listings.map((l) => (l!.fields_json?.en as { title?: string } | undefined)?.title ?? l!.id);
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
  scope: ChatScope,
  call: ToolCall,
  confirmed = false,
  clientIp?: string,
): Promise<Record<string, unknown>> {
  const op = opFor(call.name);
  if (!op) return { ok: false, message: `There is no tool called ${call.name}.` };
  const input = scope.listingId ? { ...call.args, listingId: scope.listingId } : call.args;
  let r: OpResult<unknown>;
  try {
    r = await op.call(workspace, input, { via: "chat", idempotencyKey: call.id, confirmed, clientIp });
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
