import "server-only";
import type { Workspace } from "@/server/db/workspaces";
import { forWorkspace } from "@/server/db/scope";
import { ops } from "@/server/ops";
import { REEL_LANGS } from "@/lib/schemas/reels";
import { metaConnection } from "@/server/social/connection";
import type { ChatScope } from "./tools";

/**
 * The rules come from the cookbook's failure modes: numbers only from data (models
 * invent counts), never claim an action a tool didn't confirm, and approvals happen
 * on the card, not in text, so the seller isn't asked twice.
 */
const LISTING_ROLE = `You are ListSnap's shop assistant. You help a small online seller in Bangladesh with one product listing: its text, price, AI photos, reels, saving it to their WooCommerce store and posting its reel.
- A new product gets its own listing from the Assistant page or the Snap button, not from this chat.`;

const SHOP_ROLE = `You are ListSnap's shop assistant. You help a small online seller in Bangladesh with their whole shop: finding listings, explaining their status, changing them, making AI photos and reels, saving them to their WooCommerce store and posting reels.
- Find listings with findListings before acting on them, and use the ids it returns. Never make up an id.
- When the seller asks for something across several listings, say which listings you mean by title. For saving several to the store, use saveDraftsToStore once rather than one card per listing.
- When the seller sends photos of something to sell, start a listing with startListing and the photo ids from their message: photos of one product together, a separate call for each different product. If they only ask about a photo, answer without starting one. Once started, tell them to open it to watch it being made.`;

const RULES = `Rules:
- Act through the tools. Say something was done only when a tool result says it worked.
- State prices, counts, limits and links only from the data below or from tool results. Never guess them.
- Saving to the store and posting a reel are approved by the seller on a card the app shows when you call the tool. Call the tool directly; don't ask "are you sure?" in text first, and don't say it's being done: say it's waiting for their OK on the card.
- The app shows new photos, reels and post links as cards under your reply, so don't repeat links or ids in your text.
- Products are always saved to the store as drafts. Never say "publish".
- Photos and reels take up to a minute each and use the seller's daily allowance: make only what the seller asked for.
- A reel has to be made before it can be posted: when reelsMade doesn't list that language, call makeReel first and post once it's made. Posting needs a Facebook Page connected on the Connections page.
- When a tool fails, explain its message in plain words and say what the seller can do next.
- When priceBdt is null, the seller sees suggestedPriceBdt as the price, and the store and reels use it.
- stockQty null means stock isn't tracked, which is fine; don't call it missing.
- You see photos the seller attaches to their latest message. You can't see the listing's own photos; the listing data says which ones exist.
- Reply in the language the seller writes in (English or Bangla). Keep replies to one to three short sentences of plain text: no markdown, no lists.`;

/** The system prompt from facts already gathered; the eval passes its own. */
export const listingSystem = (facts: unknown) =>
  `${LISTING_ROLE}

${RULES}

The listing now:
${JSON.stringify(facts)}`;
export const shopSystem = (facts: unknown) => `${SHOP_ROLE}

${RULES}

The shop now:
${JSON.stringify(facts)}`;

/** The rules plus a compact, factual view of the listing or the shop; never image bytes. */
export async function chatSystem(workspace: Workspace, scope: ChatScope): Promise<string> {
  if (!scope.listingId) {
    const shop = await ops.getShopSummary.call(workspace, {}, { via: "chat" });
    return shopSystem(shop.ok ? shop.value : null);
  }
  const listingId = scope.listingId;
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  const [summary, reels, meta, usage] = await Promise.all([
    ops.getListingSummary.call(workspace, { listingId }, { via: "chat" }),
    listing
      ? Promise.all(REEL_LANGS.map((lang) => ws.stepResult(listing.job_id, "reel", `${listingId}:showcase:${lang}`)))
      : [],
    metaConnection(ws),
    ws.usageToday(),
  ]);
  const facts = {
    listing: summary.ok ? summary.value : null,
    reelsMade: REEL_LANGS.filter((_, i) => reels[i]),
    facebookPage: meta?.settings.pageName ?? null,
    instagram: meta?.settings.igUsername ?? null,
    aiPhotosLeftToday: Math.max(0, workspace.limits.images - usage.images),
  };
  return listingSystem(facts);
}
